/**
 * Tests for the skill-gate hook. Run with: node --test .claude/hooks/*.test.mjs
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

import { RULES, requiredSkills, loadedSkills } from './skill-gate.mjs'

const WT = '/home/me/tucker/.claude/worktrees/some-slice'

/** One transcript line: an assistant turn invoking [skill] with the Skill tool. */
const skillCall = (skill) =>
  JSON.stringify({
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'tool_use', name: 'Skill', input: { skill } }],
    },
  })
const compaction = JSON.stringify({
  type: 'user',
  isCompactSummary: true,
  message: { role: 'user', content: 'This session is being continued…' },
})
const transcript = (...lines) => lines.join('\n') + '\n'

test('the loaded skills are the Skill calls since the last compaction, by bare name', () => {
  const text = transcript(
    skillCall('frontend-dev'),
    compaction,
    skillCall('.claude/worktrees/some-slice:playwright-best-practices'),
    skillCall('tdd'),
    '{not json',
  )

  assert.deepEqual([...loadedSkills(text)].sort(), [
    'playwright-best-practices',
    'tdd',
  ])
})

test('a Playwright spec needs the Playwright skill and tdd', () => {
  assert.deepEqual(requiredSkills(`${WT}/frontend/e2e/food-tags.spec.ts`), [
    'playwright-best-practices',
    'tdd',
  ])
})

test('source and backend tests need their playbook, and anything else needs nothing', () => {
  const cases = {
    'backend/src/test/kotlin/com/tucker/api/TagApiTest.kt': ['tdd'],
    'backend/src/main/kotlin/com/tucker/api/TagController.kt': ['backend-dev'],
    'backend/src/main/resources/db/migration/V21__x.sql': ['backend-dev'],
    'frontend/app/components/ManageTagsSheet.vue': ['frontend-dev'],
    'frontend/app/utils/entry.ts': ['frontend-dev'],
    'frontend/server/routes/sign-in.get.ts': ['frontend-dev'],
    'CLAUDE.md': [],
    'frontend/DESIGN.md': [],
    'frontend/e2e/support/mock-api.ts': ['playwright-best-practices'],
    '.claude/hooks/skill-gate.mjs': [],
  }
  for (const [file, skills] of Object.entries(cases)) {
    assert.deepEqual(requiredSkills(`${WT}/${file}`), skills, file)
  }
})

test('a Vitest file needs the component-testing skill and tdd', () => {
  for (const file of [
    'frontend/app/components/ManageTagsSheet.test.ts',
    'frontend/app/utils/entry.test.ts',
    'frontend/server/routes/api/proxy.test.ts',
  ]) {
    assert.deepEqual(
      requiredSkills(`${WT}/${file}`),
      ['component-testing-best-practices', 'tdd'],
      file,
    )
  }
})

const hookPath = join(dirname(fileURLToPath(import.meta.url)), 'skill-gate.mjs')

/** Runs the hook on a [tool] call on [file] in a session whose transcript is [text]. */
function runHook(file, text, tool = 'Write') {
  const dir = mkdtempSync(join(tmpdir(), 'skill-gate-'))
  const transcriptPath = join(dir, 'session.jsonl')
  writeFileSync(transcriptPath, text)
  const stdout = execFileSync('node', [hookPath], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: tool,
      tool_input: { file_path: file, content: '' },
      transcript_path: transcriptPath,
    }),
    encoding: 'utf8',
  })
  return stdout.trim() === '' ? null : JSON.parse(stdout)
}

test('a write missing its skills is denied, naming each one it lacks', () => {
  const out = runHook(
    `${WT}/frontend/e2e/food-tags.spec.ts`,
    transcript(skillCall('tdd')),
  )

  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse')
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny')
  const reason = out.hookSpecificOutput.permissionDecisionReason
  assert.match(reason, /playwright-best-practices/)
  assert.doesNotMatch(reason, /\btdd\b/)
  assert.match(reason, /food-tags\.spec\.ts/)
})

test('a transcript it cannot read lets the write through', () => {
  const stdout = execFileSync('node', [hookPath], {
    input: JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: `${WT}/frontend/e2e/food-tags.spec.ts` },
      transcript_path: '/nonexistent/session.jsonl',
    }),
    encoding: 'utf8',
  })
  assert.equal(stdout, '')
})

test('every rule names a skill that exists', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
  for (const rule of RULES) {
    for (const skill of rule.skills) {
      assert.ok(
        existsSync(join(repoRoot, '.claude', 'skills', skill, 'SKILL.md')),
        `rule "${rule.id}" requires /${skill}, which is not in .claude/skills/`,
      )
    }
  }
})

test("a subagent's write is judged by the skills the subagent loaded, not its parent", () => {
  const dir = mkdtempSync(join(tmpdir(), 'skill-gate-'))
  const parent = join(dir, 'session.jsonl')
  writeFileSync(parent, transcript())
  mkdirSync(join(dir, 'session', 'subagents'), { recursive: true })
  writeFileSync(
    join(dir, 'session', 'subagents', 'agent-a1b2.jsonl'),
    transcript(skillCall('playwright-best-practices'), skillCall('tdd')),
  )
  const hook = (agentId) =>
    execFileSync('node', [hookPath], {
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: `${WT}/frontend/e2e/food-tags.spec.ts` },
        transcript_path: parent,
        agent_id: agentId,
      }),
      encoding: 'utf8',
    })

  assert.equal(hook('a1b2'), '')
  assert.match(hook(undefined), /"permissionDecision":"deny"/)
})

test('a write whose skills are all loaded passes silently', () => {
  assert.equal(
    runHook(
      `${WT}/frontend/e2e/food-tags.spec.ts`,
      transcript(skillCall('playwright-best-practices'), skillCall('tdd')),
    ),
    null,
  )
})
