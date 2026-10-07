#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — refuses a new test while the branch holds a clone
 * of source code that `origin/main` does not, so the refactor step of a TDD cycle
 * happens before the next red rather than at sign-off. Probity's TDD rule sees only
 * the file being written, so duplication against another file is invisible to it.
 *
 * Fails open on any error, and says so.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_FILE =
  /(^|\/)(backend\/src\/test\/.*\.kt|frontend\/app\/.*\.test\.ts)$/

const TEST_DECLARATION = /(?<![\w.])(?:it|test)\s*\(|@Test\b/g

/**
 * Whether a pending Write or Edit leaves more test declarations than it
 * replaces: an Edit's old string, or the whole file a Write overwrites.
 */
function addsTest(input) {
  const count = (text) => (text ?? '').match(TEST_DECLARATION)?.length ?? 0
  const replaced =
    'old_string' in input ? input.old_string : currentContent(input.file_path)
  return count(input.new_string ?? input.content) > count(replaced)
}

function currentContent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

const SOURCE_TREES = ['backend/src', 'frontend/app']

/** Below the hook's own harness timeout, so a slow scan ends in a skip that says so. */
const TIMEOUT_MS = Number(process.env.CLONE_GATE_TIMEOUT_MS ?? 8000)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

const JSCPD = join(ROOT, 'node_modules/.bin/jscpd')

/**
 * What the scan reads — the threshold, the formats and the files left out — so a
 * bare `npx jscpd` at the root scans what this gate scans. SQL is not among the
 * formats: a migration can never be marked, since an edit changes its checksum.
 */
const CONFIG = join(ROOT, '.jscpd.json')

/**
 * The clones in [repo]'s source that `origin/main` does not already have, each a
 * pair of repo-relative `{ file, start }`. A clone made of nothing but preamble
 * is left out.
 */
function findClones(repo) {
  if (!existsSync(JSCPD)) {
    throw new Error(
      'jscpd is not installed. Run `npm install` at the repo root.',
    )
  }
  const out = mkdtempSync(join(tmpdir(), 'clone-gate-'))
  try {
    runJscpd(repo, out)
    const report = JSON.parse(
      readFileSync(join(out, 'jscpd-report.json'), 'utf8'),
    )
    // A Vue file's halves are named `File.vue:html` and `File.vue:typescript`.
    const side = ({ name, start }) => ({
      file: relative(repo, name.replace(/:\w+$/, '')),
      start,
    })
    return report.duplicates
      .filter((clone) => clone.isNew && !isPreamble(clone.fragment))
      .map((clone) => [side(clone.firstFile), side(clone.secondFile)])
  } finally {
    rmSync(out, { recursive: true, force: true })
  }
}

/**
 * Runs jscpd over [repo], writing its JSON report into [out]. A timeout kills only
 * jscpd's node wrapper: its native scan runs on and removes its own baseline worktree.
 */
function runJscpd(repo, out) {
  try {
    execFileSync(
      JSCPD,
      [
        '--config',
        CONFIG,
        '--baseline-from-ref',
        'origin/main',
        '-a',
        '-s',
        '-r',
        'json',
        '-o',
        out,
        ...SOURCE_TREES.filter((tree) => existsSync(join(repo, tree))),
      ],
      { cwd: repo, stdio: 'pipe', timeout: TIMEOUT_MS },
    )
  } catch (error) {
    if (error.code !== 'ETIMEDOUT') throw error
    throw new Error(`jscpd took longer than ${TIMEOUT_MS / 1000} s`)
  }
}

const PREAMBLE_LINE = /^\s*(package\s|import\s|\/\/|\/\*|\*)/

/** Whether a cloned fragment is only package lines, imports and comments: nothing to extract. */
const isPreamble = (fragment) =>
  fragment
    .split('\n')
    .every((line) => line.trim() === '' || PREAMBLE_LINE.test(line))

const git = (cwd, ...args) =>
  execFileSync('git', args, { cwd, stdio: 'pipe', timeout: TIMEOUT_MS })
    .toString()
    .split('\n')
    .filter(Boolean)

/** The nearest directory at or above [path] that exists: a new test's folder may not yet. */
function existingDir(path) {
  let dir = dirname(path)
  while (!existsSync(dir)) dir = dirname(dir)
  return dir
}

/** The deny naming each clone and the two ways out of it. */
function refusal(clones) {
  const pairs = clones.map((pair) =>
    pair.map(({ file, start }) => `${file}:${start}`).join(' ↔ '),
  )
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Refactor before the next test: ${pairs.join(', ')} duplicate each other. ` +
        'Remove it with a refactoring from https://refactoring.com/catalog/ — Extract ' +
        'Function (in Vue, an inline composable when both copies share a file, a shared ' +
        'one or a component when they do not, and a function in app/utils/ for pure ' +
        'code), Slide Statements first when the copies are interleaved with other code, ' +
        'or Pull Up Method when they sit in sibling classes. Extract under the green ' +
        "tests that already cover both copies; the new module's own spec comes once the " +
        'clone is gone. If the duplication is meant, wrap the side you keep in ' +
        'jscpd:ignore-start / jscpd:ignore-end with a one-line reason.',
    },
  }
}

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8'))
  const input = payload.tool_input ?? {}
  if (!TEST_FILE.test(input.file_path ?? '') || !addsTest(input)) return
  const [repo] = git(
    existingDir(input.file_path),
    'rev-parse',
    '--show-toplevel',
  )
  const clones = findClones(repo)
  if (clones.length > 0) process.stdout.write(JSON.stringify(refusal(clones)))
}

/**
 * Lets the write through but says the check did not run, to the user and to the
 * agent, so a skipped scan never reads as a clean one. No permission decision is
 * given: `allow` would also skip the user's permission prompt.
 */
function skipped(error) {
  // A failed command's message ends with its stderr, whose last line says why.
  const cause = String(error?.message ?? error)
    .trim()
    .split('\n')
    .at(-1)
  const message = `clone-gate skipped: ${cause}`
  process.stdout.write(
    JSON.stringify({
      systemMessage: message,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: message,
      },
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
