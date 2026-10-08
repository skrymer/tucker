/**
 * Tests for the gated-write-guard hook. Run with: node --test .claude/hooks/*.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decide } from './gated-write-guard.mjs'

const refused = (command) => decide(command) !== null

test('refuses sed -i on a gated frontend file', () => {
  assert.equal(refused("sed -i '70,87d' app/pages/profile/index.vue"), true)
  assert.equal(
    refused("cd frontend && sed -i \"2i import x\" frontend/app/pages/log.vue"),
    true,
  )
})

test('refuses a redirect or tee onto a gated file', () => {
  assert.equal(refused('cat > frontend/app/utils/x.ts <<EOF\nx\nEOF'), true)
  assert.equal(refused('echo y >> backend/src/main/kotlin/A.kt'), true)
  assert.equal(refused('printf x | tee app/components/A.vue'), true)
})

test('refuses an inline script that writes a gated file', () => {
  assert.equal(
    refused(
      "python3 - <<'PY'\np='app/components/FoodBuilder.vue'\nopen(p,'w').write(s)\nPY",
    ),
    true,
  )
  assert.equal(
    refused(
      "node -e \"require('fs').writeFileSync('frontend/app/a.test.ts', s)\"",
    ),
    true,
  )
})

test('refuses cp or mv onto a gated file', () => {
  assert.equal(refused('cp /tmp/x.vue frontend/app/components/X.vue'), true)
})

test('lets reads of gated files through', () => {
  assert.equal(refused('sed -n 1,40p app/components/AddSheet.vue'), false)
  assert.equal(refused('grep -n foo frontend/app/pages/check.vue | head'), false)
  assert.equal(refused('cat backend/src/main/kotlin/A.kt > /tmp/copy.kt'), false)
  assert.equal(
    refused("python3 -c \"print(open('app/a.ts').read())\""),
    false,
  )
})

test('lets writes to a mutation sandbox or a /tmp copy through', () => {
  assert.equal(
    refused("sed -i 's/a/b/' .stryker-tmp/sandbox-1/app/components/X.vue"),
    false,
  )
  assert.equal(
    refused('cp app/components/X.vue /tmp/x/app/components/X.vue'),
    false,
  )
})

test('lets writes to ungated files through', () => {
  assert.equal(refused('echo x > frontend/test/catalog-host.ts'), false)
  assert.equal(refused("sed -i 's/a/b/' docs/adr/0004.md"), false)
  assert.equal(refused('git checkout -- frontend/app/components/X.vue'), false)
})

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'gated-write-guard.mjs')
const runHook = (stdin) =>
  execFileSync('node', [HOOK], { input: stdin, encoding: 'utf8' })

test('answers a gated write with a deny naming the file and Edit/Write', () => {
  const out = runHook(
    JSON.stringify({
      tool_input: { command: "sed -i 's/a/b/' app/components/X.vue" },
    }),
  )
  const verdict = JSON.parse(out).hookSpecificOutput
  assert.equal(verdict.permissionDecision, 'deny')
  assert.match(verdict.permissionDecisionReason, /app\/components\/X\.vue/)
  assert.match(verdict.permissionDecisionReason, /Edit\/Write/)
})

test('fails open on input it cannot read', () => {
  assert.equal(runHook('not json'), '')
})
