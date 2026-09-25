#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook — refuses a write to a file whose project skill
 * this session has not loaded. The prompt-time skill-injector only sees the
 * words of a prompt, so a session started from a pasted path or a handoff, or a
 * test written an hour in, is never reminded; this sees the file instead.
 *
 * Fails open on any error: a gate that cannot read its input never blocks.
 */

import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

/**
 * Which project skills a file needs loaded before it is written. The first rule
 * whose path matches wins, so a test file is never also treated as source.
 */
export const RULES = [
  {
    id: 'playwright',
    path: /(^|\/)frontend\/e2e\/.*\.spec\.ts$/,
    skills: ['playwright-best-practices', 'tdd'],
  },
  {
    id: 'vitest',
    path: /(^|\/)frontend\/(app|server)\/.*\.test\.ts$/,
    skills: ['component-testing-best-practices', 'tdd'],
  },
  {
    id: 'backend-test',
    path: /(^|\/)backend\/src\/test\//,
    skills: ['tdd'],
  },
  {
    id: 'e2e-support',
    path: /(^|\/)frontend\/e2e\//,
    skills: ['playwright-best-practices'],
  },
  {
    id: 'frontend-source',
    path: /(^|\/)frontend\/(app|server)\//,
    skills: ['frontend-dev'],
  },
  {
    id: 'backend-source',
    path: /(^|\/)backend\/src\/main\//,
    skills: ['backend-dev'],
  },
]

/**
 * The skills the session has loaded since its last compaction, by bare name: a
 * worktree-scoped `dir:name` is the same skill. A compaction clears the list,
 * because the summary does not carry a skill's text forward.
 */
export function loadedSkills(transcriptText) {
  const loaded = new Set()
  for (const line of transcriptText.split('\n')) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    if (isCompaction(entry)) loaded.clear()
    const content = entry?.message?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      if (part?.type === 'tool_use' && part.name === 'Skill') {
        const skill = part.input?.skill
        if (typeof skill === 'string') loaded.add(skill.split(':').pop())
      }
    }
  }
  return loaded
}

function isCompaction(entry) {
  return (
    entry?.isCompactSummary === true ||
    (entry?.type === 'system' && entry?.subtype === 'compact_boundary')
  )
}

export function requiredSkills(filePath) {
  if (typeof filePath !== 'string') return []
  return RULES.find((rule) => rule.path.test(filePath))?.skills ?? []
}

/** The deny the hook answers with, or null when the write may go ahead. */
export function decide(filePath, loaded) {
  const missing = requiredSkills(filePath).filter((skill) => !loaded.has(skill))
  if (missing.length === 0) return null
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Project convention: load ${missing.map((s) => `/${s}`).join(' and ')} ` +
        `with the Skill tool before writing ${basename(filePath)}, then retry the ` +
        `edit. A worktree-scoped copy of a skill counts as the skill.`,
    },
  }
}

/**
 * The transcript of whoever is writing. A subagent's hook is handed its parent's
 * `transcript_path` plus its own `agent_id`, and keeps its own record beside the
 * parent's, under `<session>/subagents/agent-<id>.jsonl`.
 */
function transcriptOf(payload) {
  const parent = payload.transcript_path
  if (!payload.agent_id) return parent
  return join(
    parent.replace(/\.jsonl$/, ''),
    'subagents',
    `agent-${payload.agent_id}.jsonl`,
  )
}

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8'))
  const filePath = payload?.tool_input?.file_path
  if (requiredSkills(filePath).length === 0) return
  const loaded = loadedSkills(readFileSync(transcriptOf(payload), 'utf8'))
  const verdict = decide(filePath, loaded)
  if (verdict) process.stdout.write(JSON.stringify(verdict))
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch {
    // Fail open: a gate that cannot read its input must not block a write.
  }
}
