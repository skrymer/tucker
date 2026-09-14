import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  weightTimelineReadout,
  weightTimelineReadouts,
  weightTimelineSeries,
} from './weightTimeline'
import { timelineDays } from '~~/test/weight-timeline-fixtures'

// The stylesheet is read off disk rather than imported: under the Nuxt test
// environment a `?raw` import resolves to the empty string, which would make the
// assertions pass by finding nothing (see intakeBreakdownPalette.test.ts).

describe('weightTimelineReadout', () => {
  it('names the day, what the scale said, and where the trend stood', () => {
    expect(
      weightTimelineReadout({
        date: '2026-06-03',
        weightKg: 80.42,
        trendKg: 80.18,
      }),
    ).toBe('3 Jun 2026 · 80.4 kg · trend 80.2 kg')
  })

  it('says a day nobody weighed in on had no reading, never a figure', () => {
    // The trend still stands through it — it moves only when the scale does — so
    // the day is not silent, it just has nothing of its own to report.
    expect(
      weightTimelineReadout({
        date: '2026-06-03',
        weightKg: null,
        trendKg: 80.18,
      }),
    ).toBe('3 Jun 2026 · no weigh-in · trend 80.2 kg')
  })
})

describe('weightTimelineSeries', () => {
  const days = timelineDays([80.4, null, 80.2])
  const series = weightTimelineSeries(() => days)

  it('leaves a day nobody weighed in on off the scatter entirely', () => {
    // Undefined, not null and not zero: unovis drops a point with a missing value,
    // where a zero would draw the day on the floor.
    expect(days.map((day) => series.readingKg(day))).toEqual([
      80.4,
      undefined,
      80.2,
    ])
  })

  it('draws the trend for every day, including the ones with no reading', () => {
    expect(days.map((day) => series.trendKg(day))).toEqual([80.1, 80.1, 80.2])
  })

  it('places a day at its position in the run, the days being contiguous', () => {
    expect(days.map((day, index) => series.at(day, index))).toEqual([0, 1, 2])
  })

  it('labels the weight axis to the tenth the scale reads to', () => {
    expect(series.kgTick(80.25)).toBe('80.3')
  })

  it('labels a tick with the day at that position, and the axis needs no year', () => {
    expect(series.dayTick(1)).toBe('2 Jun')
    // The scale picks its own tick values, so it can ask for a position past the
    // data while a narrower window loads, or a fractional one between two days.
    expect(series.dayTick(99)).toBe('')
    expect(series.dayTick(1.5)).toBe('')
  })
})

describe('weightTimelineReadouts', () => {
  it('states one line per day, keyed by the day it describes', () => {
    expect(weightTimelineReadouts(timelineDays([80.4, null]))).toEqual([
      { date: '2026-06-02', text: '2 Jun 2026 · 80.4 kg · trend 80.1 kg' },
      { date: '2026-06-03', text: '3 Jun 2026 · no weigh-in · trend 80.1 kg' },
    ])
  })
})

// unovis draws its axes and crosshair from its own custom properties, and themes
// them off `html[data-theme="dark"]` — which Tucker's `html.dark` does not match.
// So its charts are styled once, from Tucker's own theme-aware tokens, in a block
// nothing in any component references by name. Both ways of breaking that are
// silent: drop the block and the chart keeps drawing in unovis' greys against the
// wrong ground, and hard-code one mode's colour and dark mode inherits it. This is
// the executable link, the move intakeBreakdownPalette.test.ts already makes.
describe('the unovis chart theming', () => {
  const css = readFileSync(
    resolve(import.meta.dirname, '../assets/css/main.css'),
    'utf8',
  )
  const CHART_CLASS = 'weight-timeline'
  const themed =
    css.match(new RegExp(`\\.${CHART_CLASS}\\s*\\{[^}]*\\}`))?.[0] ?? ''

  it('is worn by the chart the component renders', () => {
    expect(themed, `main.css declares no .${CHART_CLASS} block`).not.toBe('')
    expect(
      readFileSync(
        resolve(import.meta.dirname, '../components/WeightTimelineSection.vue'),
        'utf8',
      ),
    ).toContain(`class="${CHART_CLASS}"`)
  })

  it('overrides unovis from a class, which is what outranks its own :root defaults', () => {
    // unovis appends its light defaults to `:root` at runtime, after the static
    // stylesheet is parsed — so the same declarations on `:root` lose the cascade
    // and the chart silently draws in unovis' greys.
    const roots = css.match(/:root\s*\{[^}]*\}/g) ?? []
    for (const block of roots) {
      expect(
        block,
        'a --vis-* override on :root is dead — unovis declares its own later',
      ).not.toContain('--vis-')
    }
  })

  it('draws the axes and the crosshair in tokens that follow the theme', () => {
    for (const property of [
      '--vis-axis-grid-color',
      '--vis-axis-tick-label-color',
      '--vis-crosshair-line-stroke-color',
    ]) {
      const value = themed.match(new RegExp(`${property}:\\s*([^;]+);`))?.[1]
      expect(value, `${property} is not declared for the chart`).toBeDefined()
      // A literal colour here would be one mode's, and dark mode would inherit it.
      expect(
        value,
        `${property} must follow the theme, not name a colour`,
      ).toMatch(/^var\(--ui-[a-z-]+\)$/)
    }
  })

  it('sizes the tick labels and inherits the page face, which unovis otherwise picks', () => {
    expect(themed).toContain('--vis-axis-tick-label-font-size:')
    expect(themed).toContain('--vis-axis-font-family: inherit;')
  })
})
