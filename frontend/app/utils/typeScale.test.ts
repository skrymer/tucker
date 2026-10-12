import { describe, expect, it } from 'vitest'
import { classedElements } from '../../test/templates'
import { designSection, readFrontend, remToPx } from '../../test/designDoc'

// The type scale is stated twice: as `--text-*` tokens in `main.css`, which is
// what renders, and as DESIGN.md's Typography → Scale table, which is what a
// developer reads before styling. Nothing else ties them; this is the executable
// link.

interface TypeToken {
  size: string
  lineHeight: string
  weight?: string
  tracking?: string
}

/** The `--text-*` tokens `main.css` declares, keyed by utility class. */
function stylesheetTokens(): Record<string, TypeToken> {
  const css = readFrontend('app/assets/css/main.css')
  const tokens: Record<string, TypeToken> = {}
  for (const [, name, value] of css.matchAll(
    /--text-([a-z0-9]+(?:-[a-z0-9]+)*):\s*([^;]+);/g,
  )) {
    tokens[`text-${name}`] = { size: remToPx(value!.trim()), lineHeight: '' }
  }
  for (const [, name, property, value] of css.matchAll(
    /--text-([a-z0-9-]+?)--(line-height|font-weight|letter-spacing):\s*([^;]+);/g,
  )) {
    const token = tokens[`text-${name}`]!
    const v = value!.trim()
    if (property === 'line-height') token.lineHeight = v
    if (property === 'font-weight') token.weight = v
    if (property === 'letter-spacing') token.tracking = `+${v}`
  }
  return tokens
}

/** The rows of DESIGN.md's Typography → Scale table, keyed by their class. */
function documentedTokens(): Record<string, TypeToken> {
  const scale = designSection('### Scale')
  const tokens: Record<string, TypeToken> = {}
  for (const [row] of scale.matchAll(/^\| [^|]+\| `text-.*\|$/gm)) {
    const [, utility, sizeAndLine, weight, tracking] = row
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim())
    const [size, lineHeight] = sizeAndLine!.split('/').map((s) => s.trim())
    tokens[utility!.replaceAll('`', '')] = {
      size: size!,
      lineHeight: lineHeight!,
      // A range ("400–500") is a choice left to the template, not a token weight.
      ...(/^\d+$/.test(weight!) ? { weight } : {}),
      ...(tracking !== '—' ? { tracking } : {}),
    }
  }
  return tokens
}

describe('the type scale', () => {
  it('is stated identically by DESIGN.md and the stylesheet', () => {
    expect(stylesheetTokens()).toEqual(documentedTokens())
  })
})

/** Tailwind's stock sizes — the ones a template reaches for instead of a token. */
const STOCK_SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/
const WEIGHT =
  /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/

describe('using the type scale by name', () => {
  const elements = classedElements()

  it('finds the classed elements at all, so an empty sweep cannot pass for a clean one', () => {
    expect(elements.length).toBeGreaterThan(100)
  })

  it('never restates a token on a heading as a stock size with a weight', () => {
    const restated = elements
      .filter(({ tag }) => /^h[1-6]$/.test(tag))
      .filter(
        ({ classes }) =>
          classes.some((c) => STOCK_SIZE.test(c)) &&
          classes.some((c) => WEIGHT.test(c)),
      )
      .map(({ site }) => site)

    // Use the token whose role the heading plays — `text-h1` for a page title,
    // `text-h2` for a card heading (DESIGN.md → Typography → Scale).
    expect(restated).toEqual([])
  })

  it("never restates a token's exact size and weight on any element", () => {
    // The stock pairs that equal a token: h1 (24px/700), h2 (18px/700) and the
    // ring figure (36px/800). The other tokens have no stock equivalent.
    const pairs = [
      ['text-2xl', 'font-bold'],
      ['text-lg', 'font-bold'],
      ['text-4xl', 'font-extrabold'],
    ]
    const restated = elements
      .filter(({ classes }) =>
        pairs.some(([size, weight]) =>
          [size, weight].every((c) => classes.includes(c!)),
        ),
      )
      .map(({ site }) => site)

    expect(restated).toEqual([])
  })

  it('inks every eyebrow muted', () => {
    const otherwise = elements
      .filter(({ classes }) => classes.includes('text-eyebrow'))
      .filter(({ classes }) => !classes.includes('text-muted'))
      .map(({ site }) => site)

    expect(otherwise).toEqual([])
  })

  it('never restates the eyebrow as a stock-sized uppercase line', () => {
    const restated = elements
      .filter(
        ({ classes }) =>
          classes.includes('uppercase') &&
          classes.some((c) => STOCK_SIZE.test(c)),
      )
      .map(({ site }) => site)

    // An uppercase kicker is the eyebrow: `text-eyebrow text-muted`.
    expect(restated).toEqual([])
  })
})
