#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook (Bash) — refuses a test run whose output is piped
 * through `grep` or `head`. Probity judges a RED or GREEN from the output it is
 * shown; a filtered run hides the failing test's name and assertion, and Probity
 * then refuses genuine RED steps as unobserved. `| tail -N` keeps the summary and
 * the failures, so it passes.
 *
 * Fails open on any error: a gate that cannot read its input never blocks.
 */

import { readFileSync } from 'node:fs'

/**
 * A test suite Probity reads, invoked as a command — a package-manager call naming
 * vitest or the `test` script, or a Gradle test or build task. Matched within one
 * command (no `;`, `&` or `|` in between), so a search that merely mentions
 * "vitest" is not a test run.
 */
const TEST_RUN =
  /\b(pnpm|npx|npm|yarn)\b[^;&|]*\b(vitest|test)\b|\bgradlew\b[^;&|]*\b(test|build)\b/
/** Output piped into a filter that drops lines. */
const FILTER = /\|\s*(grep|head)\b/

/** Whether one command list (no `;`, `&&`, `||` or newline) filters a test run. */
const filtersARun = (segment) => {
  const filter = segment.search(FILTER)
  return filter >= 0 && TEST_RUN.test(segment.slice(0, filter))
}

/**
 * The deny the hook answers with, or null when the command may run. Judged per
 * command list, so a run saved whole to a file may be grepped by a later one.
 */
export function decide(command) {
  if (typeof command !== 'string') return null
  if (!command.split(/;|&&|\|\||\n/).some(filtersARun)) return null
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        'Project convention: never filter a test run through grep or head — ' +
        'Probity reads the full output to judge RED and GREEN. Pipe it through ' +
        '`| tail -N` instead, and retry.',
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
