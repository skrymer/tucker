import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OTHER_COLOR, RING_SLOT_COLORS, RING_SLOTS } from './intakeBreakdown'

// The Intake Breakdown ring is the one place Tucker colours for identity rather
// than for a role, and the palette lives in two files that never reference each
// other: the hues in `main.css`, the slot order here. The failure that pairing
// hides is silent — misname a token and the arc and its legend dot render with
// no fill at all, while every test stays green, because the ring is aria-hidden
// and the swatches are too (frontend/DESIGN.md). This is the executable link,
// the same move `exits.test.ts` makes for the service-worker exits.

// Read off disk rather than imported: under the Nuxt test environment a `?raw`
// import of a stylesheet resolves to the empty string, which would make every
// assertion below pass by finding nothing. Anchored to this file rather than to
// the working directory, which is not the project root under StrykerJS.
const css = readFileSync(
  resolve(import.meta.dirname, '../assets/css/main.css'),
  'utf8',
)

/**
 * The custom properties the palette references, read at call time rather than at
 * module load — a mutation runner attributes a constant to a test only when the
 * test is what reads it, so hoisting this would leave the palette uncovered.
 */
function referenced(): string[] {
  return [...RING_SLOT_COLORS, OTHER_COLOR].map((value) => {
    const token = value.match(/^var\((--[a-z0-9-]+)\)$/)?.[1]
    expect(
      token,
      `${value} is not a var() reference to a custom property`,
    ).toBeDefined()
    return token!
  })
}

/** Every `--tucker-cat-*` the given block declares. */
function declaredIn(selector: string): string[] {
  const blocks =
    css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'g')) ?? []
  return blocks.flatMap((b) =>
    [...b.matchAll(/(--tucker-cat-[a-z0-9-]+):/g)].map((m) => m[1]!),
  )
}

describe('the Intake Breakdown palette', () => {
  it('declares a hue for every slot the ring can fill, Other included', () => {
    const declared = declaredIn(':root')
    for (const token of referenced()) {
      expect(
        declared,
        `${token} is referenced by intakeBreakdown.ts but declared nowhere in ` +
          `main.css's :root, so its arc and legend dot would render unfilled`,
      ).toContain(token)
    }
  })

  it('re-selects every hue against the dark card rather than inheriting the light one', () => {
    const dark = declaredIn('\\.dark')
    for (const token of referenced()) {
      expect(
        dark,
        `${token} is not redefined under .dark, so dark mode falls back to a ` +
          `hue validated only against the light card (frontend/DESIGN.md)`,
      ).toContain(token)
    }
  })

  it('leaves no hue in the stylesheet that no slot can reach', () => {
    // A ninth hue added to the CSS is invisible until someone widens
    // RING_SLOT_COLORS — and a ninth Food must never be given an invented one.
    expect([...declaredIn(':root')].sort()).toEqual([...referenced()].sort())
  })

  it('gives Other a grey of its own rather than the ninth slot', () => {
    expect(RING_SLOT_COLORS).toHaveLength(RING_SLOTS)
    expect(RING_SLOT_COLORS).not.toContain(OTHER_COLOR)
  })
})

describe('the ring is the only chart whose tooltip is suppressed', () => {
  it('keeps the tooltip mounted but invisible, which is what feeds the centre readout', () => {
    // Read inside the test body, like the palette above: a constant read at
    // module load is attributed to no test by the mutation runner.
    const suppressed = [
      '--vis-tooltip-background-color: transparent',
      '--vis-tooltip-border-color: transparent',
      '--vis-tooltip-box-shadow: none',
      '--vis-tooltip-padding: 0',
    ]
    const block = css.match(/\.intake-ring\s*\{([^}]*)\}/)?.[1]

    expect(block, '`.intake-ring` is not declared in main.css').toBeDefined()
    for (const declaration of suppressed) {
      expect(block).toContain(declaration)
    }
  })
})
