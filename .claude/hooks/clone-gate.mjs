#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — refuses a new test while code the branch changed
 * duplicates other source code, so the refactor step of a TDD cycle happens
 * before the next red rather than at sign-off. Probity's TDD rule sees only the
 * file being written, so duplication against another file is invisible to it.
 *
 * Fails open on any error, and says so: a skipped scan must not read as a clean one.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_FILE = /(^|\/)(backend\/src\/test\/.*\.kt|frontend\/app\/.*\.test\.ts)$/

const TEST_DECLARATION = /(?<![\w.])(?:it|test)\s*\(|@Test\b/g

/**
 * Whether a pending Write or Edit leaves more test declarations than it
 * replaces: an Edit's old string, or the whole file a Write overwrites.
 */
function addsTest(input) {
  const count = (text) => (text ?? '').match(TEST_DECLARATION)?.length ?? 0
  const replaced = 'old_string' in input ? input.old_string : currentContent(input.file_path)
  return count(input.new_string ?? input.content) > count(replaced)
}

function currentContent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

const SOURCE_TREES = ['backend/src', 'frontend/app']

const JSCPD = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/.bin/jscpd',
)

/** The clones jscpd finds in [repo]'s source, each a pair of repo-relative `{ file, start, end }`. */
function findClones(repo) {
  if (!existsSync(JSCPD)) {
    throw new Error('jscpd is not installed. Run `npm install` at the repo root.')
  }
  const out = mkdtempSync(join(tmpdir(), 'clone-gate-'))
  try {
    execFileSync(
      JSCPD,
      [
        '--min-tokens', '30',
        // A positive list: a migration can never be marked, since an edit changes its checksum.
        '--format', 'kotlin,typescript,vue',
        '--ignore', '**/*.test.ts,backend/src/test/**',
        '-a', '-s', '-r', 'json', '-o', out,
        ...SOURCE_TREES.filter((tree) => existsSync(join(repo, tree))),
      ],
      { cwd: repo, stdio: 'pipe' },
    )
    const report = JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8'))
    // A Vue file's halves are named `File.vue:html` and `File.vue:typescript`.
    const side = ({ name, start, end }) => ({
      file: relative(repo, name.replace(/:\w+$/, '')),
      start,
      end,
    })
    return report.duplicates
      .filter((clone) => !isPreamble(clone.fragment))
      .map((clone) => [side(clone.firstFile), side(clone.secondFile)])
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

const PREAMBLE_LINE = /^\s*(package\s|import\s|\/\/|\/\*|\*)/

/** Whether a cloned fragment is only package lines, imports and comments: nothing to extract. */
const isPreamble = (fragment) =>
  fragment.split('\n').every((line) => line.trim() === '' || PREAMBLE_LINE.test(line))

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().split('\n').filter(Boolean)

/**
 * The lines the branch added or changed since it left `origin/main`, committed
 * or not, as a map from file to line numbers. An untracked file maps to `ALL`.
 */
function branchLines(repo) {
  const [base] = git(repo, 'merge-base', 'origin/main', 'HEAD')
  const changed = new Map()
  let lines
  for (const row of git(repo, 'diff', '-U0', '--no-color', base)) {
    const file = row.match(/^\+\+\+ b\/(.*)$/)
    if (file) changed.set(file[1], (lines = new Set()))
    const hunk = row.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/)
    if (hunk) {
      const [from, count] = [Number(hunk[1]), Number(hunk[2] ?? 1)]
      for (let n = from; n < from + count; n++) lines.add(n)
    }
  }
  for (const file of git(repo, 'ls-files', '--others', '--exclude-standard')) {
    changed.set(file, ALL)
  }
  return changed
}

const ALL = { has: () => true }

const touches = (changed) => ({ file, start, end }) => {
  const lines = changed.get(file)
  if (!lines) return false
  for (let n = start; n <= end; n++) if (lines.has(n)) return true
  return false
}

/** The deny naming each clone and the two ways out of it. */
function refusal(clones) {
  const pairs = clones.map((pair) => pair.map(({ file, start }) => `${file}:${start}`).join(' ↔ '))
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Refactor before the next test: ${pairs.join(', ')}. ` +
        'Extract the shared code, or wrap the side you keep in jscpd:ignore-start / ' +
        'jscpd:ignore-end with a one-line reason.',
    },
  }
}

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8'))
  const input = payload.tool_input ?? {}
  if (!TEST_FILE.test(input.file_path ?? '') || !addsTest(input)) return
  const [repo] = git(payload.cwd, 'rev-parse', '--show-toplevel')
  const changed = touches(branchLines(repo))
  const clones = findClones(repo).filter((pair) => pair.some(changed))
  if (clones.length > 0) process.stdout.write(JSON.stringify(refusal(clones)))
}

/**
 * Lets the write through but says the check did not run, to the user and to the
 * agent, so a skipped scan never reads as a clean one. No permission decision is
 * given: `allow` would also skip the user's permission prompt.
 */
function skipped(error) {
  // A failed command's own stderr says why; its message only repeats the command line.
  const cause = String(error?.stderr || error?.message || error).trim().split('\n')[0]
  const message = `clone-gate skipped: ${cause}`
  process.stdout.write(
    JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: message },
    }),
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    skipped(error)
  }
}
