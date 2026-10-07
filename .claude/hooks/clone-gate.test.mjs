/**
 * Tests for the clone-gate hook. Run with: node --test .claude/hooks/*.test.mjs
 */

import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOK = join(HERE, 'clone-gate.mjs')
const FIXTURES = join(HERE, 'fixtures', 'clone-gate')
const COMPONENTS = 'frontend/app/components'

const tempDirs = []
after(() =>
  tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })),
)

/** A fresh directory under the OS temp dir, removed when the file's tests finish. */
function tempDir(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    stdio: 'pipe',
  })

const addFixture = (repo, name) =>
  copyFileSync(join(FIXTURES, name), join(repo, COMPONENTS, name))

/**
 * A repo on a `feature` branch off `origin/main`. [onMain] are fixture files
 * committed to main, [onBranch] are committed on the branch.
 */
function repo({ onMain = [], onBranch = [] } = {}) {
  const dir = tempDir('clone-gate-')
  mkdirSync(join(dir, COMPONENTS), { recursive: true })
  mkdirSync(join(dir, 'backend/src/main'), { recursive: true })
  git(dir, 'init', '-q', '-b', 'main')
  onMain.forEach((name) => addFixture(dir, name))
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '--allow-empty', '-m', 'main')
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(dir, 'switch', '-q', '-c', 'feature')
  writeFileSync(join(dir, 'README.md'), 'a branch change outside the source\n')
  onBranch.forEach((name) => addFixture(dir, name))
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'feature')
  return dir
}

/** The grams sheet on main, and the estimate form that clones it added on the branch. */
const repoWithBranchClone = () =>
  repo({ onMain: ['LogGramsSheet.vue'], onBranch: ['EstimatedEntryForm.vue'] })

/**
 * Runs the hook on a pending tool call in [repo], returning its parsed output
 * or null. [hook] defaults to the one beside this file, whose jscpd is the
 * repo's, and [cwd] to the repo root.
 */
function runHook(
  repo,
  toolName,
  toolInput,
  { hook = HOOK, cwd = repo, env = {} } = {},
) {
  const out = execFileSync('node', [hook], {
    cwd,
    input: JSON.stringify({
      cwd,
      hook_event_name: 'PreToolUse',
      tool_name: toolName,
      tool_input: toolInput,
    }),
    env: { ...process.env, ...env },
  }).toString()
  return out.trim() === '' ? null : JSON.parse(out)
}

const newVitestTest = (repo) => ({
  file_path: join(repo, COMPONENTS, 'EstimatedEntryForm.test.ts'),
  content: "it('logs the estimate for tomorrow', async () => {})\n",
})

test('a new test is refused while a branch file clones another source file', () => {
  const repo = repoWithBranchClone()

  const verdict = runHook(repo, 'Write', newVitestTest(repo))

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, 'deny')
  const reason = verdict.hookSpecificOutput.permissionDecisionReason
  assert.match(reason, /frontend\/app\/components\/EstimatedEntryForm\.vue:21/)
  assert.match(reason, /frontend\/app\/components\/LogGramsSheet\.vue:51/)
  assert.match(reason, /refactoring\.com\/catalog/)
  for (const move of [
    'Extract Function',
    'Slide Statements',
    'Pull Up Method',
  ]) {
    assert.match(reason, new RegExp(move), move)
  }
  assert.match(reason, /inline composable/)
  assert.match(reason, /app\/utils\//)
  assert.match(reason, /green tests that already cover both copies/)
  assert.match(
    reason,
    /jscpd:ignore-start \/ jscpd:ignore-end with a one-line reason/,
  )
})

test('a clone the branch did not touch never blocks', () => {
  const legacy = repo({
    onMain: ['LogGramsSheet.vue', 'EstimatedEntryForm.vue'],
  })

  assert.equal(runHook(legacy, 'Write', newVitestTest(legacy)), null)
})

test('a clone in a new file not yet committed is refused', () => {
  const dir = repo({ onMain: ['LogGramsSheet.vue'] })
  addFixture(dir, 'EstimatedEntryForm.vue')

  const verdict = runHook(dir, 'Write', newVitestTest(dir))

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, 'deny')
})

/** Rewrites line [n] (1-based) of [file] with [change]. */
function editLine(file, n, change) {
  const lines = readFileSync(file, 'utf8').split('\n')
  lines[n - 1] = change(lines[n - 1])
  writeFileSync(file, lines.join('\n'))
}

test('a clone created in a tracked file and not yet committed is refused', () => {
  const dir = repo({ onMain: ['LogGramsSheet.vue', 'EstimatedEntryForm.vue'] })
  const form = join(dir, COMPONENTS, 'EstimatedEntryForm.vue')
  writeFileSync(form, '<template><p>an estimate</p></template>\n')
  git(dir, 'commit', '-q', '-am', 'the form, before it copies the sheet')
  git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  addFixture(dir, 'EstimatedEntryForm.vue')

  const verdict = runHook(dir, 'Write', newVitestTest(dir))

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, 'deny')
})

test('a clone whose kept side is wrapped in jscpd:ignore markers passes', () => {
  const dir = repoWithBranchClone()
  const form = join(dir, COMPONENTS, 'EstimatedEntryForm.vue')
  const lines = readFileSync(form, 'utf8').split('\n')
  // Line numbers are 1-based and taken before any insertion, so wrap bottom-up.
  const wrap = (from, to, start, end) => {
    lines.splice(to, 0, end)
    lines.splice(from - 1, 0, start)
  }
  wrap(81, 98, '<!-- jscpd:ignore-start: kept -->', '<!-- jscpd:ignore-end -->')
  wrap(20, 33, '// jscpd:ignore-start: kept', '// jscpd:ignore-end')
  writeFileSync(form, lines.join('\n'))

  assert.equal(runHook(dir, 'Write', newVitestTest(dir)), null)
})

test('a source write passes while a clone exists, so the refactor itself can land', () => {
  const dir = repoWithBranchClone()

  const verdict = runHook(dir, 'Write', {
    file_path: join(dir, 'frontend/app/composables/useLogDay.ts'),
    content: 'export function useLogDay() {}\n',
  })

  assert.equal(verdict, null)
})

test('an edit to a test file that adds no test passes', () => {
  const dir = repoWithBranchClone()

  const verdict = runHook(dir, 'Edit', {
    file_path: join(dir, COMPONENTS, 'EstimatedEntryForm.test.ts'),
    old_string:
      "it('logs the estimate', async () => {\n  expect(logged).toBe(1)",
    new_string:
      "it('logs the estimate', async () => {\n  expect(logged).toBe(2)",
  })

  assert.equal(verdict, null)
})

test('rewriting a test file whole without adding a test passes', () => {
  const dir = repoWithBranchClone()
  const testFile = join(dir, COMPONENTS, 'EstimatedEntryForm.test.ts')
  writeFileSync(testFile, "it('logs the estimate', async () => {})\n")

  const verdict = runHook(dir, 'Write', {
    file_path: testFile,
    content: "it('logs the estimate for today', async () => {})\n",
  })

  assert.equal(verdict, null)
})

test('a new Kotlin test is refused while a branch clone exists', () => {
  const dir = repoWithBranchClone()

  const verdict = runHook(dir, 'Write', {
    file_path: join(
      dir,
      'backend/src/test/kotlin/com/tucker/domain/EntryTest.kt',
    ),
    content:
      'class EntryTest {\n  @Test\n  fun `an entry may be logged for tomorrow`() {}\n}\n',
  })

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, 'deny')
})

test('duplication between test files never blocks', () => {
  const dir = repo()
  const cases = Array.from(
    { length: 12 },
    (_, i) =>
      `  expect(format(${i}, 'g', [${i}, ${i + 1}])).toBe('${i} g of ${i + 1}')`,
  ).join('\n')
  for (const file of [
    `${COMPONENTS}/First.test.ts`,
    `${COMPONENTS}/Second.test.ts`,
    'backend/src/test/kotlin/FirstTest.kt',
    'backend/src/test/kotlin/SecondTest.kt',
  ]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), `fun cases() {\n${cases}\n}\n`)
  }

  assert.equal(runHook(dir, 'Write', newVitestTest(dir)), null)
})

test('without origin/main to diff against, the test is let through with the cause said', () => {
  const dir = repoWithBranchClone()
  git(dir, 'update-ref', '-d', 'refs/remotes/origin/main')

  const verdict = runHook(dir, 'Write', newVitestTest(dir))

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, undefined)
  assert.match(verdict?.systemMessage, /^clone-gate skipped: .*origin\/main/)
  assert.equal(
    verdict.hookSpecificOutput.additionalContext,
    verdict.systemMessage,
  )
})

/** A copy of the hook in a checkout of its own, whose node_modules holds [jscpd] if given. */
function hookInCheckout(jscpd) {
  const checkout = tempDir('clone-gate-checkout-')
  const hook = join(checkout, '.claude/hooks/clone-gate.mjs')
  mkdirSync(dirname(hook), { recursive: true })
  copyFileSync(HOOK, hook)
  if (jscpd) {
    const bin = join(checkout, 'node_modules/.bin/jscpd')
    mkdirSync(dirname(bin), { recursive: true })
    writeFileSync(bin, jscpd, { mode: 0o755 })
  }
  return hook
}

test('without jscpd installed, the test is let through with npm install named', () => {
  const dir = repoWithBranchClone()
  const hook = hookInCheckout()

  const verdict = runHook(dir, 'Write', newVitestTest(dir), { hook })

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, undefined)
  assert.equal(
    verdict?.systemMessage,
    'clone-gate skipped: jscpd is not installed. Run `npm install` at the repo root.',
  )
})

test('a session working from a subdirectory is gated on the whole repo', () => {
  const dir = repoWithBranchClone()

  const verdict = runHook(dir, 'Write', newVitestTest(dir), {
    cwd: join(dir, 'frontend'),
  })

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, 'deny')
})

test('an edit elsewhere in a file holding a legacy clone passes', () => {
  const dir = repo({ onMain: ['LogGramsSheet.vue', 'EstimatedEntryForm.vue'] })
  // Line 60 closes the submit handler, outside both clones.
  editLine(
    join(dir, COMPONENTS, 'EstimatedEntryForm.vue'),
    60,
    (line) => `${line}  `,
  )

  assert.equal(runHook(dir, 'Write', newVitestTest(dir)), null)
})

test('a clone of nothing but package lines, imports and comments never blocks', () => {
  const dir = repo()
  const header = [
    'package com.tucker.api',
    '',
    '/** A controller. */',
    '// The endpoints below are owned per User.',
    ...[
      'org.springframework.http.HttpStatus',
      'org.springframework.web.bind.annotation.DeleteMapping',
      'org.springframework.web.bind.annotation.GetMapping',
      'org.springframework.web.bind.annotation.PathVariable',
      'org.springframework.web.bind.annotation.PostMapping',
      'org.springframework.web.bind.annotation.RequestBody',
      'org.springframework.web.bind.annotation.RestController',
    ].map((name) => `import ${name}`),
  ].join('\n')
  const api = join(dir, 'backend/src/main/kotlin/com/tucker/api')
  mkdirSync(api, { recursive: true })
  writeFileSync(
    join(api, 'FoodController.kt'),
    `${header}\n\nclass FoodController\n`,
  )
  writeFileSync(
    join(api, 'TagController.kt'),
    `${header}\n\nobject TagController {}\n`,
  )

  assert.equal(runHook(dir, 'Write', newVitestTest(dir)), null)
})

test('a clone between SQL migrations never blocks, since a migration cannot be marked', () => {
  const dir = repo()
  const table = Array.from(
    { length: 10 },
    (_, i) => `    col_${i} INTEGER NOT NULL DEFAULT ${i},`,
  )
  const migrations = join(dir, 'backend/src/main/resources/db/migration')
  mkdirSync(migrations, { recursive: true })
  for (const [file, name] of [
    ['V1__food.sql', 'food'],
    ['V2__food_owned.sql', 'food_new'],
  ]) {
    writeFileSync(
      join(migrations, file),
      `CREATE TABLE ${name} (\n    id INTEGER PRIMARY KEY,\n${table.join('\n')}\n    note TEXT\n);\n`,
    )
  }

  assert.equal(runHook(dir, 'Write', newVitestTest(dir)), null)
})

test('a repo with only one of the two source trees is still scanned', () => {
  const dir = repoWithBranchClone()
  rmSync(join(dir, 'backend'), { recursive: true })

  const verdict = runHook(dir, 'Write', newVitestTest(dir))

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, 'deny')
})

test('when jscpd fails, its own error is what the skip names', () => {
  const dir = repoWithBranchClone()
  const hook = hookInCheckout(
    '#!/bin/sh\necho "Error: the scan broke" >&2\nexit 1\n',
  )

  const verdict = runHook(dir, 'Write', newVitestTest(dir), { hook })

  assert.equal(
    verdict?.systemMessage,
    'clone-gate skipped: Error: the scan broke',
  )
})

test('a scan that outlasts its time limit is let through with the limit named', () => {
  const dir = repoWithBranchClone()
  const hook = hookInCheckout('#!/bin/sh\nexec sleep 5\n')

  const verdict = runHook(dir, 'Write', newVitestTest(dir), {
    hook,
    env: { CLONE_GATE_TIMEOUT_MS: '200' },
  })

  assert.equal(
    verdict?.systemMessage,
    'clone-gate skipped: jscpd took longer than 0.2 s',
  )
})

test('a call that only ends in it( or test( is not a new test', () => {
  const dir = repoWithBranchClone()

  const verdict = runHook(dir, 'Edit', {
    file_path: join(dir, COMPONENTS, 'EstimatedEntryForm.test.ts'),
    old_string: '  await user.click(button)\n',
    new_string:
      '  await submit(form)\n  expect(/\\d+ g/.test(text)).toBe(true)\n',
  })

  assert.equal(verdict, null)
})

test('a source write that declares a function named test is not a new test', () => {
  const dir = repoWithBranchClone()

  const verdict = runHook(dir, 'Write', {
    file_path: join(
      dir,
      'backend/src/main/kotlin/com/tucker/domain/LabelRule.kt',
    ),
    content:
      'object LabelRule {\n  fun test(label: String) = label.isNotBlank()\n}\n',
  })

  assert.equal(verdict, null)
})

test('a test written into another checkout is gated on that checkout', () => {
  const dir = repoWithBranchClone()
  const elsewhere = repo()

  const verdict = runHook(dir, 'Write', newVitestTest(dir), { cwd: elsewhere })

  assert.equal(verdict?.hookSpecificOutput?.permissionDecision, 'deny')
})

test('a payload that is not JSON is let through with the parse error said', () => {
  const out = execFileSync('node', [HOOK], { input: 'not json' }).toString()

  const verdict = JSON.parse(out)
  assert.equal(verdict.hookSpecificOutput.permissionDecision, undefined)
  assert.match(verdict.systemMessage, /^clone-gate skipped: .*JSON/)
})
