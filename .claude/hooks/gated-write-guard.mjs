#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (Bash) — refuses a shell command that writes a file
 * Probity gates (`frontend/app/**\/*.{ts,vue}`, `backend/src/**\/*.kt`). Probity
 * judges RED and GREEN on Write and Edit only, so `sed -i`, a redirect, `tee`, a
 * `cp`/`mv` onto the file or an inline script that writes it lands unjudged. A copy
 * under `.stryker-tmp/` or `/tmp` is not gated, so hand-mutation stays possible.
 *
 * Fails open on any error: a gate that cannot read its input never blocks.
 */

import { readFileSync } from 'node:fs'

/** A path Probity gates, relative to the repo, `frontend/` or `backend/`. */
const GATED = /(?:^|\/)(?:app\/\S*\.(?:ts|vue)|src\/\S*\.kt)$/

/** A copy made to mutate or measure, which nothing gates. */
const SCRATCH = /(?:^|\/)\.stryker-tmp\/|^\/tmp\//

const PATH_TOKEN = /[\w./~@+-]+\.(?:ts|vue|kt)\b/g

const isGated = (path) => GATED.test(path) && !SCRATCH.test(path)

const gatedPaths = (segment) =>
  (segment.match(PATH_TOKEN) ?? []).filter(isGated)

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A redirect, `tee`, or `sed -i` aimed at [path]. */
const writesWithShell = (segment, path) =>
  new RegExp(`(?:>>?|\\btee\\b(?:\\s+-a)?)\\s*['"]?${escape(path)}`).test(
    segment,
  ) ||
  (/\bsed\b[^|]*\s-i/.test(segment) && segment.includes(path))

/** `cp`, `mv` or `install` whose destination is [path]. */
const copiesOnto = (segment, path) =>
  /\b(?:cp|mv|install)\b/.test(segment) &&
  segment.trim().split(/\s+/).at(-1)?.replace(/['"]/g, '') === path

/** An inline Python or Node script that names [path] and writes a file. */
const scriptWrites = (command, path) =>
  /\b(?:python3?|node)\b/.test(command) &&
  command.includes(path) &&
  /open\([^)]*['"][wa]\+?['"]|\.write_text\(|writeFile(?:Sync)?\(/.test(command)

const segmentsOf = (command) => command.split(/;|&&|\|\||\n|\|/)

/**
 * The deny the hook answers with, or null when the command may run.
 */
export function decide(command) {
  if (typeof command !== 'string') return null
  const offending = new Set()
  for (const segment of segmentsOf(command)) {
    for (const path of gatedPaths(segment)) {
      if (writesWithShell(segment, path) || copiesOnto(segment, path))
        offending.add(path)
    }
  }
  for (const path of gatedPaths(command)) {
    if (scriptWrites(command, path)) offending.add(path)
  }
  if (offending.size === 0) return null
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `Project convention: ${[...offending].join(', ')} is gated by Probity, ` +
        'which only judges Write and Edit — write it with Edit/Write, not a ' +
        'shell command. To mutate a copy, write it under .stryker-tmp/ or /tmp.',
    },
  }
}

function main() {
  const payload = JSON.parse(readFileSync(0, 'utf8'))
  const verdict = decide(payload?.tool_input?.command)
  if (verdict) process.stdout.write(JSON.stringify(verdict))
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch {
    // Fail open: a gate that cannot read its input must not block a command.
  }
}
