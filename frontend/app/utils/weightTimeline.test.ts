import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BUDGET_COLOR,
  INTAKE_COLOR,
  OVER_BUDGET_COLOR,
  READING_COLOR,
  TREND_COLOR,
  UNLOGGED_COLOR,
  weightTimelineReadout,
  weightTimelineReadouts,
  weightTimelineScale,
  weightTimelineSeries,
} from './weightTimeline'
import {
  timelineDay,
  timelineDays,
  weightTimeline,
  withIntake,
} from '~~/test/weight-timeline-fixtures'

// The stylesheet is read off disk rather than imported: under the Nuxt test
// environment a `?raw` import resolves to the empty string, which would make the
// assertions pass by finding nothing (see intakeBreakdownPalette.test.ts).

describe('weightTimelineReadout', () => {
  it('names the day, what the scale said, and where the trend stood', () => {
    expect(
      weightTimelineReadout(
        {
          date: '2026-06-03',
          weightKg: 80.42,
          trendKg: 80.18,
        },
        false,
      ),
    ).toBe('3 Jun 2026 · 80.4 kg · trend 80.2 kg')
  })

  it('states what a day cost against the Budget standing on it', () => {
    expect(
      weightTimelineReadout(
        {
          date: '2026-06-03',
          weightKg: 80.42,
          trendKg: 80.18,
          caloriesKcal: 1748.6,
          calorieBudgetKcal: 1800,
        },
        true,
      ),
    ).toBe('3 Jun 2026 · 80.4 kg · trend 80.2 kg · 1749 / 1800 kcal')
  })

  it('names a day in a tracking window that carries no Entry', () => {
    // A missing bar and a floor-height bar are the same picture, so the readout is
    // where "no Entry" gets said in words. The Budget still stood on the day.
    expect(
      weightTimelineReadout(
        {
          date: '2026-06-03',
          weightKg: 80.42,
          trendKg: 80.18,
          caloriesKcal: null,
          calorieBudgetKcal: 1800,
        },
        true,
      ),
    ).toBe('3 Jun 2026 · 80.4 kg · trend 80.2 kg · not logged')
  })

  it('says a day nobody weighed in on had no reading, never a figure', () => {
    // The trend still stands through it — it moves only when the scale does — so
    // the day is not silent, it just has nothing of its own to report.
    expect(
      weightTimelineReadout(
        {
          date: '2026-06-03',
          weightKg: null,
          trendKg: 80.18,
        },
        false,
      ),
    ).toBe('3 Jun 2026 · no weigh-in · trend 80.2 kg')
  })
})

describe('weightTimelineSeries', () => {
  const days = timelineDays([80.4, null, 80.2])
  const timeline = weightTimeline({ days })
  const series = weightTimelineSeries(
    () => timeline,
    () => weightTimelineScale(timeline),
  )

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

describe('weightTimelineSeries — the intake half', () => {
  const days = withIntake(timelineDays([80.4, null, 80.2]), [2000, null, 1000])
  const tracked = weightTimeline({ days, loggedDays: 2 })
  const series = weightTimelineSeries(
    () => tracked,
    () => weightTimelineScale(tracked),
  )

  it('starts a bar at the floor of the plot and the weights well above them', () => {
    const scale = weightTimelineScale(weightTimeline({ days, loggedDays: 2 }))!
    const [floor, ceiling] = scale.kgDomain

    // A day of no calories has no height, which is what makes a drawn bar's
    // height its calories rather than an offset from somewhere.
    expect(scale.toKg(0)).toBe(floor)
    // The top of the plot is the heaviest thing drawn — no padding above it, so
    // the weight band keeps the resolution slice 1 gave it.
    expect(ceiling).toBe(80.4)
    expect(floor).toBeLessThan(80.1)
  })

  it('gives the weights the top of the plot and keeps the tallest bar off them', () => {
    // Two scales on one plot is what ADR 0029 accepts for not stacking panes; what
    // makes it readable is that the two never meet.
    const scale = weightTimelineScale(weightTimeline({ days, loggedDays: 2 }))!
    const [floor, ceiling] = scale.kgDomain
    const plot = ceiling - floor
    const lowestWeight = Math.min(...days.map((day) => day.trendKg))

    expect((ceiling - lowestWeight) / plot).toBeCloseTo(0.55, 2)
    // The tallest day in the window fills most of the bar band and still stops
    // short of the weights — the headroom is what keeps the two apart.
    const tallest = scale.toKg(2000)
    expect((tallest - floor) / plot).toBeGreaterThan(0.35)
    expect((tallest - floor) / plot).toBeLessThan(0.42)
    expect(tallest).toBeLessThan(lowestWeight)
  })

  it('leaves room for a Budget nobody reached, not just for the days they logged', () => {
    // The dashed line is drawn on the bars' scale, so a week eaten well under
    // budget must not put the Budget itself up among the weights.
    const frugal = withIntake(timelineDays([80.4, 80.2]), [1200, 1400], 1800)
    const scale = weightTimelineScale(
      weightTimeline({ days: frugal, loggedDays: 2 }),
    )!
    const [floor, ceiling] = scale.kgDomain

    const budgetAt = scale.toKg(1800)
    expect((budgetAt - floor) / (ceiling - floor)).toBeLessThan(0.42)
    expect(budgetAt).toBeLessThan(Math.min(...frugal.map((day) => day.trendKg)))
  })

  it('draws the band around the trend standing on a day nobody weighed in on', () => {
    // The trend is carried forward, so the opening day of a window can hold the
    // highest figure on the chart and no reading at all — leaving it out of the
    // band would draw the line above the plot.
    const carried = [
      timelineDay({
        date: '2026-06-01',
        weightKg: null,
        trendKg: 81,
        caloriesKcal: 1500,
        calorieBudgetKcal: 1800,
      }),
      timelineDay({
        date: '2026-06-02',
        weightKg: 80,
        trendKg: 80,
        caloriesKcal: 1500,
        calorieBudgetKcal: 1800,
      }),
    ]

    const scale = weightTimelineScale(
      weightTimeline({ days: carried, loggedDays: 2 }),
    )!

    expect(scale.kgDomain[1]).toBe(81)
  })

  it('still has a band to draw when the weight did not move at all', () => {
    // A fortnight at exactly one figure leaves no range to divide the plot by, so
    // the band is padded — and only then.
    const flat = withIntake(
      timelineDays([80.0, 80.0, 80.0]).map((day) => ({
        ...day,
        trendKg: 80.0,
      })),
      [1800, 1800, 1800],
    )

    const scale = weightTimelineScale(
      weightTimeline({ days: flat, loggedDays: 3 }),
    )!

    const [floor, ceiling] = scale.kgDomain
    // Padded by a fifth of a kilo either side, which is a band and not a guess at
    // how much the weight might have moved.
    expect(ceiling).toBeCloseTo(80.2, 5)
    expect(floor).toBeLessThan(80.0)
    expect(scale.kgTicks).toContain(80.0)
  })

  it('labels a band too narrow to contain a round tenth, inside that band', () => {
    // A maintaining User's whole 28 days can sit between two tenths, and an axis
    // handed a tick outside its own band draws it down among the bars — or, past
    // the ceiling, not at all.
    const hairline = withIntake(
      timelineDays([80.02, 80.06]).map((day, index) => ({
        ...day,
        trendKg: index === 0 ? 80.02 : 80.06,
      })),
      [1800, 1800],
    )

    const scale = weightTimelineScale(
      weightTimeline({ days: hairline, loggedDays: 2 }),
    )!

    expect(scale.kgTicks).toHaveLength(1)
    expect(scale.kgTicks[0]!).toBeGreaterThanOrEqual(80.02)
    expect(scale.kgTicks[0]!).toBeLessThanOrEqual(80.06)
  })

  it('coarsens the kilogram step as the weight range widens', () => {
    // Every tenth of a kilo across a two-kilo range would be twenty-one labels.
    const wide = withIntake(
      timelineDays([79.0, 80.0, 81.0]).map((day, index) => ({
        ...day,
        trendKg: 79 + index,
      })),
      [1800, 1800, 1800],
    )

    const scale = weightTimelineScale(
      weightTimeline({ days: wide, loggedDays: 3 }),
    )!

    expect(scale.kgTicks).toEqual([79, 79.5, 80, 80.5, 81])
  })

  it('has no scale of its own with Calorie Tracking off, so the weight keeps the whole card', () => {
    expect(
      weightTimelineScale(weightTimeline({ days: timelineDays([80.4, 80.2]) })),
    ).toBeNull()
  })

  it('marks a day with no Entry at the baseline rather than drawing nothing', () => {
    // An absence rendered as nothing is indistinguishable from an absence rendered
    // as zero, and a User needs to know their own log has holes in it (ADR 0029).
    const [floor] = weightTimelineScale(
      weightTimeline({ days, loggedDays: 2 }),
    )!.kgDomain
    const tick = series.intakeKg(days[1]!)!
    const smallestBar = series.intakeKg(days[2]!)!

    expect(tick).toBeGreaterThan(floor)
    // And unmistakable for one: a tick stands far under the shortest real day.
    expect(tick).toBeLessThan(floor + (smallestBar - floor) / 4)
  })

  it('labels the kilogram axis only where there are weights, never down among the bars', () => {
    // The domain reaches far below the readings to make room for the bars, and a
    // kilogram gridline among them would mark a weight nobody ever had.
    const scale = weightTimelineScale(weightTimeline({ days, loggedDays: 2 }))!

    expect(scale.kgTicks).toEqual([80.1, 80.2, 80.3, 80.4])
  })

  it('carries the Budget across a day with no Entry, which it never lapsed on', () => {
    // A Budget is set by a Weekly Review and holds all week, so breaking the line
    // over a gap would assert it lapsed because the User stopped recording.
    const budgets = days.map((day) => series.budgetKg(day))

    expect(budgets[1]).toBe(budgets[0])
    expect(budgets[1]).toBe(budgets[2])
    // And it is drawn on the bars' scale, between the shortest day and the tallest.
    expect(budgets[0]!).toBeGreaterThan(series.intakeKg(days[2]!)!)
    expect(budgets[0]!).toBeLessThan(series.intakeKg(days[0]!)!)
  })

  it('states a day logged before the first review without inventing a Budget for it', () => {
    // A window opens where the readings start, which can be before the User was
    // ever given a figure to eat to — and a day with no Budget is not over one.
    const unbudgeted = withIntake(timelineDays([80.4]), [2600], null)
    const earlyTimeline = weightTimeline({ days: unbudgeted, loggedDays: 1 })
    const early = weightTimelineSeries(
      () => earlyTimeline,
      () => weightTimelineScale(earlyTimeline),
    )

    expect(weightTimelineReadout(unbudgeted[0]!, true)).toBe(
      '3 Jun 2026 · 80.4 kg · trend 80.1 kg · 2600 kcal',
    )
    expect(early.intakeColor(unbudgeted[0]!)).toBe(INTAKE_COLOR)
    expect(early.budgetKg(unbudgeted[0]!)).toBeUndefined()
  })

  it('colours a day over its Budget as the exception it is', () => {
    // Error red once over, the DayRing and DESIGN.md convention for this very
    // figure — and the bar standing above the Budget line is the second signal,
    // so colour is not carrying it alone.
    expect(series.intakeColor(days[0]!)).toBe(OVER_BUDGET_COLOR)
    expect(series.intakeColor(days[2]!)).toBe(INTAKE_COLOR)
    expect(series.intakeColor(days[1]!)).toBe(UNLOGGED_COLOR)
  })

  it('never draws a day that was logged under one that was not', () => {
    // A black coffee is a fraction of a Budget, and a bar shorter than the "no
    // Entry" tick would read as less than nothing — inverting the one distinction
    // the tick exists to make.
    const barelyLogged = withIntake(timelineDays([80.4, null, 80.2]), [
      2000,
      null,
      20,
    ])
    const sparseTimeline = weightTimeline({ days: barelyLogged, loggedDays: 2 })
    const sparse = weightTimelineSeries(
      () => sparseTimeline,
      () => weightTimelineScale(sparseTimeline),
    )

    expect(sparse.intakeKg(barelyLogged[2]!)!).toBeGreaterThanOrEqual(
      sparse.intakeKg(barelyLogged[1]!)!,
    )
  })

  it('takes the over-budget verdict from the response rather than deriving one', () => {
    // Under its Budget by the figures and over it by the verdict — an impossible
    // pair, chosen so that a client comparing the two numbers itself fails here.
    // The backend owns this verdict, on the rule a day's DayStatus already uses.
    const stated = [
      timelineDay({
        caloriesKcal: 900,
        calorieBudgetKcal: 1800,
        overBudget: true,
      }),
    ]
    const timeline = weightTimeline({ days: stated, loggedDays: 1 })
    const series = weightTimelineSeries(
      () => timeline,
      () => weightTimelineScale(timeline),
    )

    expect(series.intakeColor(stated[0]!)).toBe(OVER_BUDGET_COLOR)
  })

  it('draws a bigger day taller, and keeps every bar clear of the weight band', () => {
    // Two scales on one plot (ADR 0029): the weight owns the top of the card and
    // the bars the bottom, so a bar can never be mistaken for a weight.
    const [big, , small] = days.map((day) => series.intakeKg(day)!)

    expect(big).toBeGreaterThan(small!)
    expect(big).toBeLessThan(Math.min(...days.map((day) => day.trendKg)))
  })
})

describe('weightTimelineReadouts', () => {
  it('states one line per day, keyed by the day it describes', () => {
    expect(
      weightTimelineReadouts(
        weightTimeline({ days: timelineDays([80.4, null]) }),
      ),
    ).toEqual([
      { date: '2026-06-02', text: '2 Jun 2026 · 80.4 kg · trend 80.1 kg' },
      { date: '2026-06-03', text: '3 Jun 2026 · no weigh-in · trend 80.1 kg' },
    ])
  })

  it('takes whether there is an intake half from the timeline, not from a day', () => {
    // `loggedDays` is the whole of that signal: a tracking day can carry neither
    // figure — unlogged, and before the first review — and is not a weight-only day.
    const days = timelineDays([80.4, null])
    const lines = weightTimelineReadouts(
      weightTimeline({ days, loggedDays: 1 }),
    )

    expect(lines.map((line) => line.text)).toEqual([
      '2 Jun 2026 · 80.4 kg · trend 80.1 kg · not logged',
      '3 Jun 2026 · no weigh-in · trend 80.1 kg · not logged',
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

  it('names every mark with a custom property, which is what a swatch resolves', () => {
    // A colour that is not a `var()` reference renders its stroke, bar or swatch
    // unfilled — invisibly, the chart being aria-hidden (frontend/DESIGN.md).
    for (const colour of [
      TREND_COLOR,
      READING_COLOR,
      INTAKE_COLOR,
      OVER_BUDGET_COLOR,
      BUDGET_COLOR,
      UNLOGGED_COLOR,
    ]) {
      expect(colour).toMatch(/^var\(--[a-z0-9-]+\)$/)
    }
  })

  it("declares the calorie bar's own hue for both themes", () => {
    // No `--ui-*` role means "a calorie bar", so this one hue is the chart\'s own —
    // and a hue declared once would be the light card\'s, inherited on to the dark.
    const token = INTAKE_COLOR.match(/^var\((--[a-z0-9-]+)\)$/)?.[1]
    expect(token, `${INTAKE_COLOR} is not a var() reference`).toBeDefined()
    for (const selector of [':root', '\\.dark']) {
      const blocks =
        css.match(new RegExp(`${selector}\\s*\\{[^}]*\\}`, 'g')) ?? []
      expect(
        blocks.some((block) => block.includes(`${token}:`)),
        `${token} is referenced by weightTimeline.ts but declared nowhere in ` +
          `main.css's ${selector}, so every calorie bar would render unfilled`,
      ).toBe(true)
    }
  })

  it('sizes the tick labels and inherits the page face, which unovis otherwise picks', () => {
    expect(themed).toContain('--vis-axis-tick-label-font-size:')
    expect(themed).toContain('--vis-axis-font-family: inherit;')
  })
})
