import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { components } from '#open-fetch-schemas/api'
import { tooFew } from '~~/test/mocks/handlers/metrics'
import {
  figuresLine,
  PARTS,
  rowLabel,
  rowName,
  timingRows,
  waitsLine,
} from './routeTiming'

type LayoutFigures = components['schemas']['LayoutFiguresResponse']

type Layout = LayoutFigures['layout']

const measured = (layout: Layout, n: number): LayoutFigures => ({
  layout,
  n,
  p50: 300,
  p75: 450,
  p95: 700,
  apiP75: 250,
  coldP75: 900,
  serverMs: 80,
  networkMs: 160,
  renderMs: 200,
})

describe("the Admin chart's rows", () => {
  it("lists each route's phone above its desktop, the routes in the backend's order", () => {
    const rows = timingRows([
      {
        route: '/review',
        layouts: [measured('phone', 48), measured('desktop', 63)],
      },
      {
        route: '/foods',
        layouts: [measured('phone', 20), measured('desktop', 9)],
      },
    ])

    expect(rows.map((r) => [rowName(r), r.figures.n])).toEqual([
      ['/review · Phone', 48],
      ['/review · Desktop', 63],
      ['/foods · Phone', 20],
      ['/foods · Desktop', 9],
    ])
  })

  it('is named by its route and its layout', () => {
    const [row] = timingRows([
      { route: '/foods/[id]', layouts: [measured('desktop', 12)] },
    ])

    expect(rowName(row!)).toBe('/foods/[id] · Desktop')
  })
})

describe("a row's label on the Admin chart", () => {
  it('is the row name alone when the row has a bar', () => {
    const [row] = timingRows([
      { route: '/review', layouts: [measured('phone', 48)] },
    ])

    expect(rowLabel(row!)).toBe('/review · Phone')
  })

  // A missing bar says nothing on its own: the label is what says why it is missing.
  it('says when there are too few samples for a bar, and how many', () => {
    const [row] = timingRows([
      { route: '/profile', layouts: [tooFew('desktop', 3)] },
    ])

    expect(rowLabel(row!)).toBe('/profile · Desktop · too few (n 3)')
  })
})

describe('a bar on the Admin chart', () => {
  it('states its count and its percentiles in ms', () => {
    expect(
      figuresLine({ layout: 'phone', n: 48, p50: 640, p75: 910, p95: 1820 }),
    ).toBe('n 48 · p50 640 · p75 910 · p95 1820 ms')
  })

  it('states the p75 of its wait on the api and of its first visits', () => {
    expect(
      waitsLine({ ...measured('phone', 48), apiP75: 420, coldP75: 1310 }),
    ).toBe('api p75 420 · cold p75 1310 ms')
  })

  // First visits are a few of a group's moves, so they are often too few on their own.
  it('says when there are too few first visits for a cold figure', () => {
    expect(
      waitsLine({ ...measured('phone', 48), apiP75: 420, coldP75: null }),
    ).toBe('api p75 420 ms · cold p75 too few')
  })
})

describe("the Admin chart's parts", () => {
  // Stacked from the server outwards, each in the categorical palette's fixed order.
  it('stacks the server, then network and proxy, then render and JS', () => {
    expect(PARTS).toEqual([
      { name: 'Server', figure: 'serverMs', color: 'var(--tucker-cat-1)' },
      {
        name: 'Network + proxy',
        figure: 'networkMs',
        color: 'var(--tucker-cat-2)',
      },
      { name: 'Render / JS', figure: 'renderMs', color: 'var(--tucker-cat-3)' },
    ])
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
