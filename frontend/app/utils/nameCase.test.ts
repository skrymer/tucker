import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Tucker states every name it renders in sentence case (frontend/DESIGN.md →
// Case), and the rule is enforced by remembering to call `formatName` at each of
// twenty-odd render sites. Three things make a forgotten one invisible rather
// than merely unguarded: `formatName` is auto-imported, so a new `{{ food.name }}`
// adds no import line and the omission is an *absence* in a diff; every fixture
// name in `test/` is already sentence case, so the whole unit suite is a no-op on
// the rule; and each existing site is pinned by its own test, which catches its
// removal and not an addition somewhere new.
//
// So the next name-rendering surface would ship `LIGHT MILK` beside `Rolled oats`
// with four green suites and nothing for a reviewer to notice. This is the
// executable link — the move `exits.test.ts` makes for the service-worker exits
// and `RunAsCallSitesTest` makes for the backend's one `runAs` call site.

// Anchored to this file rather than the working directory, which is not the
// project root under StrykerJS.
const APP = resolve(import.meta.dirname, '..')

/**
 * Every place a template can state a value: an interpolation, a template literal
 * inside one, and a bound attribute — which is neither, and is how a name reaches
 * an `aria-label`, a sheet `title` or an alert `description`.
 */
const STATED = /\{\{(.*?)\}\}|\$\{([^}]*)\}|:[\w.-]+="([^"]*)"/gs

/**
 * An expression that reaches a name. Case-insensitive and unanchored on purpose:
 * `referenceFoodName` and `foodName` are names too, and `/\bname\b/` matches
 * neither.
 */
const STATES_A_NAME = /name/i

/**
 * A site that states a name without calling `formatName`, and why that is right
 * there. Keyed on the expression as well as the file, so a *new* unformatted
 * expression in an allowed file still fails: the point is that adding one is a
 * deliberate edit carrying a written reason, not that a file is exempt for good.
 *
 * Every key must still match a live site — see the staleness test below.
 */
const ALLOWED: Record<string, Record<string, string>> = {
  'components/AddFoodForm.vue': {
    "markTouched('name')":
      'the form field key, not a name being stated to anybody',
  },
  'components/DaySummary.vue': {
    'entry.name': 'handed to FigureRow, which states it',
    '`Delete ${formatEntryName(entry)}`':
      'formatEntryName states the name it interpolates',
  },
  'components/DeleteEntryConfirm.vue': {
    entryName: 'the computed is formatEntryName, which states the name',
  },
  'components/FoodListItem.vue': {
    'food.name': 'handed to FigureRow, which states it',
    'food.referenceFoodName':
      'a published FSANZ name, stated as FSANZ writes it (ADR 0027)',
    '`Delete ${name}`': 'the local `name` computed is formatName(food.name)',
    '`View ingredients in ${name}`':
      'the local `name` computed is formatName(food.name)',
    '`Change what ${name} borrows vitamins and minerals from`':
      'the local `name` computed is formatName(food.name)',
    '`Tags on ${name}`': 'the local `name` computed is formatName(food.name)',
    '`Tags for ${name}`': 'the local `name` computed is formatName(food.name)',
    '`${tags.hidden} more tags on ${name}`':
      'the local `name` computed is formatName(food.name)',
    'tag.name':
      'a Tag keeps the spelling its User gave it, so it is never recased (ADR 0033)',
  },
  'components/FoodPickList.vue': {
    'food.name': 'handed to FigureRow, which states it',
  },
  'components/IntakeBreakdownSection.vue': {
    'row.name': 'intakeLegend states every legend row name',
    'focused.name': 'intakeLegend states every legend row name',
  },
  'components/RecipeCompositionSheet.vue': {
    name: 'inside the `title` computed, which states it before interpolating',
  },
  'components/ReferenceFoodPicker.vue': {
    'candidate.name':
      'a published FSANZ name, stated as FSANZ writes it (ADR 0027)',
    'food.referenceFoodName':
      'a published FSANZ name, stated as FSANZ writes it (ADR 0027)',
  },
  'components/ManageTagsSheet.vue': {
    'tag.name':
      'a Tag keeps the spelling its User gave it, so it is never recased (ADR 0033)',
    '`Delete ${tag.name}`':
      'a Tag keeps the spelling its User gave it, so it is never recased (ADR 0033)',
  },
  'components/TagChips.vue': {
    'tag.name':
      'a Tag keeps the spelling its User gave it, so it is never recased (ADR 0033)',
  },
  'pages/log.vue': {
    'tag.value.name':
      'a Tag keeps the spelling its User gave it, so it is never recased (ADR 0033)',
  },
  'pages/design.vue': {
    's.name': 'a colour token in the style guide, not a name a User typed',
  },
}

function sfcs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) return sfcs(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

/** Every name-stating site in the app's templates, as `file` + `expression`. */
function nameSites(): { file: string; expression: string }[] {
  return sfcs(APP).flatMap((path) => {
    const file = path.slice(APP.length + 1)
    const source = readFileSync(path, 'utf8')
    return [...source.matchAll(STATED)]
      .map((match) =>
        (match[1] ?? match[2] ?? match[3] ?? '').split(/\s+/).join(' ').trim(),
      )
      .filter((expression) => STATES_A_NAME.test(expression))
      .map((expression) => ({ file, expression }))
  })
}

describe('stating a name in sentence case', () => {
  it('puts every name a template states through formatName', () => {
    const unstated = nameSites()
      .filter(({ expression }) => !expression.includes('formatName('))
      .filter(
        ({ file, expression }) => ALLOWED[file]?.[expression] === undefined,
      )
      .map(({ file, expression }) => `${file}: ${expression}`)

    // If this fails on a site you just added: wrap it in `formatName`, or render
    // it through `FigureRow`, which states the name for you. If it genuinely
    // should not be — it is not a name a User typed, or something upstream has
    // already stated it — add it to ALLOWED with the reason.
    expect(unstated).toEqual([])
  })

  it('finds the sites at all, so an empty sweep cannot pass for a clean one', () => {
    // Without this, a glob that silently matched nothing — a moved directory, a
    // changed extension, a regex that stopped matching — would report the rule
    // as kept everywhere.
    expect(nameSites().length).toBeGreaterThan(15)
  })

  it('holds no exemption for a site that no longer exists', () => {
    // An exemption that outlives its code is worse than none: it silently
    // pre-authorises an unformatted re-addition of that expression in that file.
    const live = new Set(
      nameSites().map(({ file, expression }) => `${file}: ${expression}`),
    )
    const stale = Object.entries(ALLOWED).flatMap(([file, byExpression]) =>
      Object.keys(byExpression)
        .map((expression) => `${file}: ${expression}`)
        .filter((site) => !live.has(site)),
    )

    expect(stale).toEqual([])
  })

  it('carries a reason for every site it lets through', () => {
    const entries = Object.entries(ALLOWED).flatMap(([file, byExpression]) =>
      Object.entries(byExpression).map(([expression, reason]) => ({
        site: `${file}: ${expression}`,
        reason,
      })),
    )

    expect(entries.length).toBeGreaterThan(0)
    expect(entries.filter(({ reason }) => reason.length < 20)).toEqual([])
  })
})
