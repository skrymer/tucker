/**
 * Tests for the test-output-guard hook. Run with: node --test .claude/hooks/*.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decide } from './test-output-guard.mjs'

const refused = (command) => decide(command) !== null

test('refuses a Vitest run filtered through grep', () => {
  assert.equal(
    refused('pnpm exec vitest run app/x.test.ts 2>&1 | grep -E "×|Tests"'),
    true,
  )
})

test('lets a search that only mentions a test runner through', () => {
  assert.equal(refused('grep -rn "vitest" frontend/app | head -5'), false)
})

test('lets a test run piped through tail run, which keeps the failures', () => {
  assert.equal(refused('pnpm test 2>&1 | tail -40'), false)
  assert.equal(refused('./gradlew test --tests X 2>&1 | tail -60'), false)
})

test('lets an unfiltered test run through', () => {
  assert.equal(refused('pnpm -C frontend exec vitest run app/x.test.ts'), false)
})

test('refuses a Gradle test or build filtered through grep, and a run cut by head', () => {
  assert.equal(refused('./gradlew test --tests GoalTest | grep FAIL'), true)
  assert.equal(refused('cd backend && ./gradlew build 2>&1 | grep -i error'), true)
  assert.equal(refused('pnpm test 2>&1 | head -20'), true)
})

test('lets a run saved whole to a file be filtered by a later command', () => {
  assert.equal(
    refused('./gradlew test --tests X > out.txt 2>&1; grep -n FAILED out.txt | head'),
    false,
  )
  assert.equal(
    refused('./gradlew test --tests X 2>&1 | tail -3 && grep -c killed report.txt'),
    false,
  )
})

const HOOK = join(dirname(fileURLToPath(import.meta.url)), 'test-output-guard.mjs')
const runHook = (stdin) =>
  execFileSync('node', [HOOK], { input: stdin, encoding: 'utf8' })

test('answers a filtered test run with a deny naming tail', () => {
  const out = runHook(
    JSON.stringify({ tool_input: { command: 'pnpm test | grep Tests' } }),
  )
  const verdict = JSON.parse(out).hookSpecificOutput

  assert.equal(verdict.permissionDecision, 'deny')
  assert.match(verdict.permissionDecisionReason, /tail -N/)
})

test('fails open on input it cannot read', () => {
  assert.equal(runHook('{not json'), '')
})
