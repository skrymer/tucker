import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { components } from '#open-fetch-schemas/api'
import { figuresLine, routeLabel } from './routeTiming'

type LayoutFigures = components['schemas']['LayoutFiguresResponse']

const measured = (layout: string, n: number): LayoutFigures => ({
  layout,
  n,
  p50: 300,
  p75: 450,
  p95: 700,
})
describe('a route on the Admin chart', () => {
  it('is named by its route alone when both layouts have a figure', () => {
    expect(
      routeLabel({
        route: '/review',
        layouts: [measured('phone', 48), measured('desktop', 63)],
      }),
    ).toBe('/review')
  })

  // A missing bar says nothing on its own: the label is what says why it is missing.
  it('names each layout with too few samples for a figure, and its count', () => {
    expect(
      routeLabel({
        route: '/profile',
        layouts: [tooFew('phone', 3), tooFew('desktop', 2)],
      }),
    ).toBe('/profile (Phone too few: 3, Desktop too few: 2)')
  })
})

describe('a bar on the Admin chart', () => {
  it('states its count and its percentiles in ms', () => {
    expect(
      figuresLine({ layout: 'phone', n: 48, p50: 640, p75: 910, p95: 1820 }),
    ).toBe('n 48 · p50 640 · p75 910 · p95 1820 ms')
  })
})

// Read off disk: under the Nuxt test environment a `?raw` import is the empty
// string, which would pass by finding nothing. Why a class and not `:root`:
// DESIGN.md → The Weight Timeline, and weightTimeline.test.ts guards that rule.
describe("the Admin chart's theme", () => {
  it('draws axes and tooltips in tokens that follow light and dark', () => {
    const css = readFileSync(
      resolve(import.meta.dirname, '../assets/css/main.css'),
      'utf8',
    )
    const themed = css.match(/\.route-timing\s*\{[^}]*\}/)?.[0] ?? ''

    for (const [property, token] of [
      ['--vis-axis-grid-color', '--ui-border'],
      ['--vis-axis-tick-label-color', '--ui-text-muted'],
      ['--vis-tooltip-background-color', '--ui-bg-elevated'],
      ['--vis-tooltip-border-color', '--ui-border'],
      ['--vis-tooltip-text-color', '--ui-text'],
    ]) {
      expect(themed).toMatch(new RegExp(`${property}:\\s*var\\(${token}\\)`))
    }
    expect(
      readFileSync(
        resolve(import.meta.dirname, '../components/RouteTimingCard.vue'),
        'utf8',
      ),
    ).toContain('class="route-timing"')
  })
})

function tooFew(layout: string, n: number): LayoutFigures {
  return { layout, n, p50: null, p75: null, p95: null }
}
