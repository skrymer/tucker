// "A probe named without its value is not a probe" is stated in three places
// that are each sent or read standalone — the verdict auditor's brief (C), the
// acceptance ledger's brief (D), and /verify's own Verdict block — so none can
// cite another, and nothing but this file notices one of them drifting.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const SKILLS = resolve(dirname(fileURLToPath(import.meta.url)), '../skills')
const RULE = /a probe named without its value is not a probe/i

/**
 * A markdown file's text from a heading to the next heading of that level,
 * ignoring headings inside fenced code — the templates carry their own.
 */
function section(file, heading) {
  const lines = readFileSync(resolve(SKILLS, file), 'utf8').split('\n')
  const start = lines.findIndex((line) => line.startsWith(heading))
  assert.notEqual(start, -1, `${file} has no "${heading}"`)
  const level = heading.match(/^#+/)[0]
  let fenced = false
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith('```')) fenced = !fenced
    if (!fenced && lines[i].startsWith(`${level} `)) {
      end = i
      break
    }
  }
  // Wrapped prose: the sentence may break across lines and indentation.
  return lines.slice(start, end).join(' ').replace(/\s+/g, ' ')
}

test('the verdict auditor brief states the probe rule', () => {
  assert.match(
    section('feature-sign-off/references/agent-briefs.md', '## Brief C'),
    RULE,
  )
})

test('the acceptance ledger brief states the probe rule', () => {
  assert.match(
    section('feature-sign-off/references/agent-briefs.md', '## Brief D'),
    RULE,
  )
})

test("/verify's Verdict block states the probe rule", () => {
  assert.match(section('verify/SKILL.md', '## Verdict'), RULE)
})
