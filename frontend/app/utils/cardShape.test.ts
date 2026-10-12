import { describe, expect, it } from 'vitest'
import { useAppConfig } from '#imports'
import { appTemplates } from '../../test/templates'
import { designSection, readFrontend, remToPx } from '../../test/designDoc'

// Card shape is stated twice: in the app config's card theme and the stylesheet's
// radius tokens, which are what render, and in DESIGN.md's Shape & elevation
// table, which is what a developer reads before styling. This is the executable
// link between them.

const shape = designSection('## Shape & elevation')
const css = readFrontend('app/assets/css/main.css')

/** The value cell of DESIGN.md's Shape & elevation row named [token]. */
function documented(token: string): string {
  const row = shape.split('\n').find((line) => line.startsWith(`| ${token} `))
  return row?.split('|')[2]?.trim() ?? ''
}

/** Tailwind's spacing scale: `p-5` → `20px`. */
const spacing = (step: string) => `${Number.parseFloat(step) * 4}px`

/** A card slot's padding steps, phone and from `lg`; a slot is a class string or a replacer of the stock classes. */
function cardPadding(name: 'header' | 'body' | 'footer') {
  const slot = (
    useAppConfig().ui.card.slots as Record<
      string,
      string | ((stock: string) => string) | undefined
    >
  )[name]
  const classes = typeof slot === 'function' ? slot('') : (slot ?? '')
  return {
    phone: classes.match(/(?:^|\s)px?-([\d.]+)/)?.[1],
    desktop: classes.match(/(?:^|\s)lg:px?-([\d.]+)/)?.[1],
  }
}

describe('the card shape', () => {
  it('pads every card as DESIGN.md states, phone and desktop', () => {
    const { phone, desktop } = cardPadding('body')

    expect(documented('Card padding')).toBe(
      `${spacing(phone ?? 'NaN')}, ${spacing(desktop ?? 'NaN')} from \`lg\``,
    )
  })

  it.each(['header', 'footer'] as const)(
    "pads a card's %s at its body's sides, phone and desktop",
    (name) => {
      expect(cardPadding(name)).toEqual(cardPadding('body'))
    },
  )

  it.each([
    ['Card radius', 'card'],
    ['Inset radius', 'inset'],
  ])('states the %s its stylesheet token draws', (row, token) => {
    const rem = css.match(
      new RegExp(`--radius-${token}:\\s*([\\d.]+rem);`),
    )?.[1]

    expect(documented(row)).toBe(
      `${remToPx(rem ?? 'NaN')} (\`rounded-${token}\`)`,
    )
  })
})

describe('using the shape tokens by name', () => {
  it('never states an arbitrary radius in a component', () => {
    // The whole source, not only static classes: a bound `:class`, a `:ui`
    // string or a class constant in the script restates a radius just as well.
    const arbitrary = appTemplates().flatMap(({ file, source }) =>
      (source.match(/\brounded(-[a-z]+)?-\[[^\]]*\]/g) ?? []).map(
        (radius) => `${file}: ${radius}`,
      ),
    )

    // A card-shaped corner is `rounded-card`; an inset's is `rounded-inset`
    // (DESIGN.md → Shape & elevation).
    expect(arbitrary).toEqual([])
  })
})
