#!/usr/bin/env node
/**
 * Claude Code UserPromptSubmit hook — reminds Claude to invoke the project
 * skill that covers what a prompt is about, before it starts working.
 *
 * Every rule below exists because Claude has actually forgotten that skill in
 * this repo often enough to be worth a memory file. The table is deliberately
 * NOT a map of every skill: a reminder that fires on an ordinary prompt is
 * noise, and noise is what trains a reader to skip the block entirely.
 *
 * Advisory only. It never blocks a prompt and it fails open on any error.
 */

import { readFileSync } from 'node:fs'

/**
 * The two test-layer patterns, and the general one composed from them.
 *
 * /tdd covers a test of ANY type, so it must fire whenever a more specific
 * test rule does. Composing its pattern from theirs makes that hold by
 * construction; three hand-kept word lists would only make it likely.
 */
const PLAYWRIGHT = /\bplaywright\b|\be2e\b|smoke\w*|\baria snapshot\b|\.spec\.ts/i
const COMPONENT_TESTING =
  /component test\w*|\bvitest\b|\btesting library\b|\brendersuspended\b|\.test\.ts/i
const TDD = new RegExp(
  [
    /\btdd\b|\bred[- ]green\b|\btests?\b|\btesting\b|\bspecs?\b/i.source,
    /\bbugs?\b|\bbroken\b|\bfailing\b|\bregressions?\b/i.source,
    PLAYWRIGHT.source,
    COMPONENT_TESTING.source,
  ].join('|'),
  'i',
)

/** How many reminders one prompt may produce. Ordered most specific first. */
export const MAX_REMINDERS = 3

/**
 * `scope` says where the skill lives: 'project' ones must resolve under
 * .claude/skills/ and the test asserts they do; 'personal' ones live in the
 * user's own ~/.claude/skills/ and cannot be checked from the repo.
 */
export const RULES = [
  {
    id: 'mutation-test',
    skill: 'mutation-test',
    scope: 'project',
    pattern: /\bmutation (test|sweep|scor)\w*|\bstryker\b|\bpitest\b|\bmutants?\b/i,
    why: 'scope the sweep to what changed, and give every survivor a verdict.',
  },
  {
    id: 'deploy-prod',
    skill: 'deploy-prod',
    scope: 'project',
    pattern: /\bdeploy\w*\b|\bship it\b|\brelease it\b|\bto prod(uction)?\b|\bthe vps\b|\btucker-diet\b/i,
    why: 'pull the GHCR tag CI published; "once merged" means merge it too.',
  },
  {
    id: 'playwright',
    skill: 'playwright-best-practices',
    scope: 'project',
    pattern: PLAYWRIGHT,
    why: 'required before writing or editing any Playwright spec.',
  },
  {
    id: 'component-testing',
    skill: 'component-testing-best-practices',
    scope: 'project',
    pattern: COMPONENT_TESTING,
    why: 'required before writing or editing any Vue component or unit test.',
  },
  {
    id: 'tdd',
    skill: 'tdd',
    scope: 'project',
    pattern: TDD,
    why: 'one test per red-green cycle, and a bug fix starts with a failing test.',
  },
  {
    id: 'write-a-skill',
    skill: 'write-a-skill',
    scope: 'personal',
    pattern: /\b(write|writing|create|creating|author|authoring|new|add)\b[^.!?]{0,40}\bskills?\b/i,
    why: "don't write a SKILL.md freehand.",
  },
  {
    id: 'verify',
    skill: 'verify',
    scope: 'project',
    pattern: /\bverif\w+\b|\bwalk[- ]?through\b|\bwalk it through\b|does it (actually )?work|\bin (a|the) (real )?browser\b/i,
    why: 'a real claude-in-chrome walk-through at both viewports, not Playwright.',
  },
  {
    id: 'feature-sign-off',
    skill: 'feature-sign-off',
    scope: 'project',
    pattern: /\bsign[- ]?off\b|\bsigned[- ]?off\b|ready to (commit|push|ship)|\b(open|raise) (a|the) pr\b|\brun the gates\b|\bwrap (this |it )?up\b/i,
    why: 'run the seven gates in order — not the gates ad hoc, and not after the commit.',
  },
  {
    id: 'frontend-design',
    skill: 'frontend-design',
    scope: 'personal',
    pattern: /\b(ui|ux) design\b|\bdesign (the |a |this )?(screen|page|layout|component)\b|\blook and feel\b|\bvisual design\b/i,
    why: 'and collaborate with the voltagent-core-dev:ui-designer agent on screens.',
  },
  {
    id: 'check-adrs',
    skill: 'check-adrs',
    scope: 'project',
    pattern: /\badrs?\b|\bcontext\.md\b|\bubiquitous language\b|\brecorded decisions?\b/i,
    why: 'verify the diff against the ADRs and CONTEXT.md before the PR.',
  },
  {
    id: 'grill-with-docs',
    skill: 'grill-with-docs',
    scope: 'personal',
    pattern: /\bplan\b|\bplanning\b|\bdesign (a|the|this)\b|\bapproach\b|how should (we|i)\b|\bstress[- ]test\b/i,
    why: 'align this way — never EnterPlanMode/ExitPlanMode.',
  },
]

/**
 * The rules whose skill this prompt should be reminded of, most specific
 * first. A skill the prompt already invokes by name is dropped — the reminder
 * would be telling Claude to do what the user just asked for.
 */
export function selectSkills(prompt) {
  if (typeof prompt !== 'string' || prompt.trim() === '') return []
  return RULES.filter(
    (rule) => rule.pattern.test(prompt) && !alreadyInvoked(prompt, rule.skill),
  ).slice(0, MAX_REMINDERS)
}

function alreadyInvoked(prompt, skill) {
  return new RegExp(`/${skill}\\b`, 'i').test(prompt)
}

/** The context block handed back to Claude. Empty when nothing matched. */
export function render(rules) {
  if (rules.length === 0) return ''
  const lines = rules.map((rule) => `- /${rule.skill} — ${rule.why}`)
  return [
    'Project convention — these skills cover what this prompt is about.',
    'Invoke each with the Skill tool BEFORE starting the work:',
    ...lines,
  ].join('\n')
}

function main() {
  let payload
  try {
    payload = JSON.parse(readFileSync(0, 'utf8'))
  } catch {
    return // Fail open: a hook that cannot read its input must not block a prompt.
  }

  const matched = selectSkills(payload?.prompt)
  if (matched.length === 0) return

  process.stdout.write(
    JSON.stringify({
      // A common output field, not a hook-specific one: nested, it is ignored.
      systemMessage: `skill-injector: ${matched.map((rule) => rule.skill).join(', ')}`,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: render(matched),
      },
    }),
  )
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch {
    // Fail open, as above.
  }
}
