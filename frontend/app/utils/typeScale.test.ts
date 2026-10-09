import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The type scale is stated twice: as `--text-*` tokens in `main.css`, which is
// what renders, and as DESIGN.md's Typography → Scale table, which is what a
// developer reads before styling. Nothing else ties them, and they had already
// drifted apart once — the doc's h1 said 30px/800 while every screen rendered
// 24px/700. This is the executable link.

// Read off disk, anchored to this file: a `?raw` stylesheet import resolves to
// the empty string under the Nuxt test environment, and the working directory is
// not the project root under StrykerJS.
const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, path), 'utf8')

interface TypeToken {
  size: string
  lineHeight: string
  weight?: string
  tracking?: string
}

const REM = 16

/** A rem length in the px DESIGN.md writes: `1.5rem` → `24px`. */
function toPx(rem: string): string {
  return `${Number.parseFloat(rem) * REM}px`
}

/** The `--text-*` tokens `main.css` declares, keyed by utility class. */
function stylesheetTokens(): Record<string, TypeToken> {
  const css = read('../assets/css/main.css')
  const tokens: Record<string, TypeToken> = {}
  for (const [, name, value] of css.matchAll(
    /--text-([a-z0-9]+(?:-[a-z0-9]+)*):\s*([^;]+);/g,
  )) {
    tokens[`text-${name}`] = { size: toPx(value!.trim()), lineHeight: '' }
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
  const scale = read('../../DESIGN.md').split('### Scale')[1]!.split('###')[0]!
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

const APP = resolve(import.meta.dirname, '..')

/** Tailwind's stock sizes — the ones a template reaches for instead of a token. */
const STOCK_SIZE = /^text-(xs|sm|base|lg|xl|[2-9]xl)$/
const WEIGHT =
  /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/

function sfcs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) return sfcs(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

/** Every element in the app's templates with a static class. */
function classedElements(): { site: string; tag: string; classes: string[] }[] {
  return sfcs(APP).flatMap((path) => {
    const file = path.slice(APP.length + 1)
    const source = readFileSync(path, 'utf8')
    return [
      ...source.matchAll(/<([a-zA-Z][\w-]*)\s[^>]*?\bclass="([^"]*)"/g),
    ].map(([, tag, classList]) => {
      const classes = classList!.split(/\s+/).filter(Boolean)
      return {
        site: `${file}: <${tag}> ${classes.join(' ')}`,
        tag: tag!,
        classes,
      }
    })
  })
}

describe('using the type scale by name', () => {
  it('never restates a token on a heading as a stock size with a weight', () => {
    const restated = classedElements()
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

  it('never restates the eyebrow as a stock-sized uppercase line', () => {
    const restated = classedElements()
      .filter(
        ({ classes }) =>
          classes.includes('uppercase') &&
          classes.some((c) => STOCK_SIZE.test(c)),
      )
      .map(({ site }) => site)

    // An uppercase kicker is the eyebrow: `text-eyebrow uppercase text-muted`.
    expect(restated).toEqual([])
  })
})
