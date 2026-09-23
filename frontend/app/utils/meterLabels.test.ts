import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// `aria-label` on a `UProgress` or a `USlider` is inert: it falls through to the
// component's root element, which carries no role, while the element that does
// carry one is named by the library. The remedies differ (`UProgress` has
// `get-value-label`; `USlider` needs a labelled wrapper), so this pins only the
// half they share — the attribute is never passed to either.
//
// A source sweep because every other layer is blind to it: an aria snapshot
// canonises whatever name is there, so it records the wrong one just as happily
// as the right one. The executable link `intakeBreakdownPalette.test.ts` already
// provides for the palette, for that same reason.

const APP_DIR = resolve(import.meta.dirname, '..')

/** Every `.vue` under `app/`, read at call time, as `<path, source>`. */
function templates(): [string, string][] {
  return readdirSync(APP_DIR, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.vue'))
    .map((name) => [name, readFileSync(resolve(APP_DIR, name), 'utf8')])
}

/**
 * The opening tag of every `<Component …>` in [source], attributes and all.
 *
 * Scanned rather than matched with `[^>]*`, which ends the tag at the first `>`
 * — and `>` is inside every `() =>` an attribute binds, so a `[^>]*` sweep reads
 * the tag as ending mid-arrow and never sees the attributes after it.
 */
function openingTags(source: string, component: string): string[] {
  const tags: string[] = []
  const opener = new RegExp(`<${component}\\b`, 'g')
  for (const match of source.matchAll(opener)) {
    let quote: string | null = null
    for (let i = match.index + match[0].length; i < source.length; i++) {
      const char = source[i]!
      if (quote) {
        if (char === quote) quote = null
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (char === '>') {
        tags.push(source.slice(match.index, i + 1))
        break
      }
    }
  }
  return tags
}

describe('meter labelling', () => {
  it('never labels a UProgress or a USlider with an inert aria-label', () => {
    const offenders = templates().flatMap(([name, source]) =>
      ['UProgress', 'USlider']
        .flatMap((component) => openingTags(source, component))
        .filter((tag) => /\baria-label\s*=/.test(tag))
        .map((tag) => `${name}: ${tag}`),
    )

    expect(offenders).toEqual([])
  })
})
