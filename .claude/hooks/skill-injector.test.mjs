/**
 * Tests for the skill-injector hook. Run with: node --test .claude/hooks/
 *
 * The load-bearing one is "every project rule names a skill that exists":
 * the rules table and .claude/skills/ are two files that otherwise never
 * reference each other, so renaming a skill would leave every reminder
 * pointing at nothing with no test going red — the same trap exits.ts and
 * RunAsCallSitesTest exist to close.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { execFileSync } from 'node:child_process'

import { RULES, MAX_REMINDERS, selectSkills, render } from './skill-injector.mjs'

const hookDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(hookDir, '..', '..')
const hookPath = join(hookDir, 'skill-injector.mjs')

const runHook = (stdin) =>
  execFileSync('node', [hookPath], { input: stdin, encoding: 'utf8' })

const skillsOf = (prompt) => selectSkills(prompt).map((rule) => rule.skill)

test('every project rule names a skill that exists', () => {
  for (const rule of RULES.filter((r) => r.scope === 'project')) {
    assert.ok(
      existsSync(join(repoRoot, '.claude', 'skills', rule.skill, 'SKILL.md')),
      `rule "${rule.id}" points at /${rule.skill}, which is not in .claude/skills/`,
    )
  }
})

test('every rule declares a scope the test knows how to treat', () => {
  for (const rule of RULES) {
    assert.ok(
      rule.scope === 'project' || rule.scope === 'personal',
      `rule "${rule.id}" has scope "${rule.scope}"`,
    )
  }
})

test('a prompt about committing is reminded to run the sign-off gates', () => {
  assert.ok(skillsOf('this is done, ready to push').includes('feature-sign-off'))
})

test('a prompt about a Playwright spec is reminded of both testing skills', () => {
  const skills = skillsOf('add a playwright smoke for the log destination')
  assert.deepEqual(skills.slice(0, 2), ['playwright-best-practices', 'tdd'])
})

test('every kind of test prompt reaches /tdd, whichever layer it names', () => {
  const prompts = [
    'add a playwright smoke for the log destination',
    'fix the failing vitest component test',
    'write an e2e spec for the grid',
    'the aria snapshot in today.spec.ts is stale',
    'add a test for filterFoods',
  ]
  for (const prompt of prompts) {
    assert.ok(skillsOf(prompt).includes('tdd'), `"${prompt}" did not reach /tdd`)
  }
})

test('a bug report is reminded that a fix starts with a failing test', () => {
  assert.ok(skillsOf('the ring is broken on /review').includes('tdd'))
})

test("a mutation sweep is matched by the repo's own word for it", () => {
  assert.ok(skillsOf('run the mutation sweep on entry.ts').includes('mutation-test'))
  assert.ok(skillsOf('mutation test the new util').includes('mutation-test'))
  assert.ok(skillsOf('any surviving mutants?').includes('mutation-test'))
})

test('a planning prompt is pointed at grill-with-docs, not plan mode', () => {
  assert.ok(skillsOf('what is the plan for F17?').includes('grill-with-docs'))
})

test('an ordinary prompt gets no reminder at all', () => {
  assert.deepEqual(skillsOf('what does IntakeBreakdown.of refuse?'), [])
})

test('a skill the prompt already invokes is not reminded of', () => {
  assert.ok(!skillsOf('/verify the new grid at both viewports').includes('verify'))
})

test('no prompt produces more than the cap', () => {
  const everything = RULES.map((rule) => rule.id).join(' ') +
    ' tdd playwright vitest deploy adr plan stryker sign-off verify design a screen new skill'
  assert.ok(selectSkills(everything).length <= MAX_REMINDERS)
})

test('an empty or absent prompt is not a match', () => {
  assert.deepEqual(skillsOf(''), [])
  assert.deepEqual(skillsOf('   '), [])
  assert.deepEqual(skillsOf(undefined), [])
})

test('the rendered block names each skill as an invocable command', () => {
  const block = render(selectSkills('ready to push'))
  assert.match(block, /^- \/feature-sign-off — /m)
})

test('nothing matched renders nothing', () => {
  assert.equal(render([]), '')
})

test('the hook emits UserPromptSubmit context for a matching prompt', () => {
  const out = runHook(
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', user_prompt: 'ready to push' }),
  )
  const parsed = JSON.parse(out)
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit')
  assert.match(parsed.hookSpecificOutput.additionalContext, /\/feature-sign-off/)
  assert.match(parsed.hookSpecificOutput.systemMessage, /feature-sign-off/)
})

test('the hook stays silent rather than emitting an empty block', () => {
  const out = runHook(
    JSON.stringify({ hook_event_name: 'UserPromptSubmit', user_prompt: 'hello' }),
  )
  assert.equal(out, '')
})

test('unreadable input fails open instead of blocking the prompt', () => {
  assert.equal(runHook('not json at all'), '')
})
