import { describe, expect, it, vi } from 'vitest'
import { camelize, defineComponent, h, nextTick } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { TimelineDay } from '~/utils/weightTimeline'
import { READING_COLOR, TREND_COLOR } from '~/utils/weightTimeline'
import WeightTimelineSection from './WeightTimelineSection.vue'
import { timelineDays, weightTimeline } from '~~/test/weight-timeline-fixtures'

/**
 * The chart, mocked for the whole file. It is a third-party component with no
 * accessible surface, so ADR 0013's "mock only the true external boundary" puts
 * it here — and unovis' `MutationObserver` teardown throws under happy-dom, so
 * the real one cannot mount at all. The browser layers render it for real.
 */
const seen: Record<string, Record<string, unknown>> = {}
function chartPart(name: string) {
  return defineComponent({
    inheritAttrs: false,
    setup: (_props, { attrs, slots }) => {
      return () => {
        // Keys camelized: a component declaring no props (VisCrosshair) receives
        // every binding through attrs in the casing the template wrote it, so
        // this reads the same either way.
        seen[name] = Object.fromEntries(
          Object.entries(attrs).map(([key, value]) => [camelize(key), value]),
        )
        return h('div', slots.default?.())
      }
    },
  })
}
vi.mock('@unovis/vue', () => ({
  VisXYContainer: chartPart('VisXYContainer'),
  VisLine: chartPart('VisLine'),
  VisScatter: chartPart('VisScatter'),
  VisAxis: chartPart('VisAxis'),
  VisCrosshair: chartPart('VisCrosshair'),
}))

describe('WeightTimelineSection', () => {
  it('states every day it draws in words, since the chart itself is decorative', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: {
        timeline: weightTimeline({ days: timelineDays([80.4, null, 80.2]) }),
      },
    })

    expect(
      screen.getByText('1 Jun 2026 · 80.4 kg · trend 80.1 kg'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('2 Jun 2026 · no weigh-in · trend 80.1 kg'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('3 Jun 2026 · 80.2 kg · trend 80.2 kg'),
    ).toBeInTheDocument()
  })

  it('hands the chosen window to the page, which is what asks for it', async () => {
    const user = userEvent.setup()
    const chosen = vi.fn()
    await renderSuspended(WeightTimelineSection, {
      props: {
        timeline: weightTimeline(),
        windowDays: 28,
        'onUpdate:windowDays': chosen,
      },
    })

    await user.click(screen.getByRole('tab', { name: '90 days' }))

    expect(chosen).toHaveBeenCalledWith(90)
  })

  it('offers 28 days and 90, marking the window being shown', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline(), windowDays: 90 },
    })

    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(
      '90 days',
    )
    expect(
      within(screen.getByRole('group', { name: 'Window' })).getAllByRole('tab'),
    ).toHaveLength(2)
  })

  // An aria-hidden chart has no accessible surface, so what it was handed is
  // invisible to every other assertion. Pinned through its own props, the only
  // seam it has (see known-survivors.md).
  it('draws the trend as the line and the readings as points beneath it', async () => {
    const days = timelineDays([80.4, null, 80.2])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })

    expect(seen.VisXYContainer!.data).toEqual(days)
    const trendY = seen.VisLine!.y as (day: TimelineDay) => number
    expect(days.map((day) => trendY(day))).toEqual([80.1, 80.1, 80.2])
    // A day nobody weighed in on contributes no point: unovis drops a missing
    // value rather than drawing it at the floor.
    const readingY = seen.VisScatter!.y as (
      day: TimelineDay,
    ) => number | undefined
    expect(days.map((day) => readingY(day))).toEqual([80.4, undefined, 80.2])
  })

  it('reads out the day under the pointer', async () => {
    const days = timelineDays([80.4, null, 80.2])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })
    const pointAt = seen.VisCrosshair!.onCrosshairMove as (
      x: number | undefined,
      day: TimelineDay,
    ) => void

    pointAt(1, days[1]!)
    await nextTick()

    expect(screen.getByRole('status')).toHaveTextContent(
      '2 Jun 2026 · no weigh-in · trend 80.1 kg',
    )
  })

  it('holds the day it last read out, a tap having no hover to leave', async () => {
    const days = timelineDays([80.4, null, 80.2])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })
    const pointAt = seen.VisCrosshair!.onCrosshairMove as (
      x?: number,
      day?: TimelineDay,
    ) => void

    pointAt(2, days[2]!)
    await nextTick()
    // What unovis reports when the pointer leaves the container.
    pointAt(undefined, undefined)
    await nextTick()

    expect(screen.getByRole('status')).toHaveTextContent(
      '3 Jun 2026 · 80.2 kg · trend 80.2 kg',
    )
  })

  it('drops a readout the new window no longer draws', async () => {
    const days = timelineDays([80.4, null, 80.2])
    const { rerender } = await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })
    const pointAt = seen.VisCrosshair!.onCrosshairMove as (
      x: number,
      day: TimelineDay,
    ) => void
    pointAt(0, days[0]!)
    await nextTick()

    // A narrower window, opening after the day being read out.
    await rerender({ timeline: weightTimeline({ days: days.slice(1) }) })

    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('names both strokes, so neither is identified by its colour alone', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline() },
    })

    expect(screen.getByText('Trend')).toBeVisible()
    expect(screen.getByText('Weigh-ins')).toBeVisible()
    // The key draws in the colours the chart was handed, so a swatch cannot come
    // to name a stroke it no longer matches.
    expect(seen.VisLine!.color).toBe(TREND_COLOR)
    expect(seen.VisScatter!.color).toBe(READING_COLOR)
  })

  it('says a wider window is on its way rather than passing the old one off as it', async () => {
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline(), pending: true },
    })

    expect(screen.getByRole('region', { name: 'Your weight' })).toHaveAttribute(
      'aria-busy',
      'true',
    )
  })

  it('names no day while the crosshair is hidden, whatever is nearest the pointer', async () => {
    // Along the x-axis strip the pointer is outside the plotted range: unovis still
    // reports the nearest day, and passes no position to say it is marking nothing.
    const days = timelineDays([80.4, null, 80.2])
    await renderSuspended(WeightTimelineSection, {
      props: { timeline: weightTimeline({ days }) },
    })
    const pointAt = seen.VisCrosshair!.onCrosshairMove as (
      x: number | undefined,
      day: TimelineDay,
    ) => void

    pointAt(undefined, days[2]!)
    await nextTick()

    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
