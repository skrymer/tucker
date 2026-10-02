import type { components } from '#open-fetch-schemas/api'
import { askedWindow, failingRead, http } from '../http'

type Timeline = components['schemas']['WeightTimelineResponse']

/** The widths a Weight Timeline is read over, in days. */
type Width = 28 | 90

/**
 * The Weight Timeline [byWidth] holds for the width asked about — null for the
 * withheld state, a 404, which is what under a fortnight of readings gets. The
 * timeline states its own window, as the real endpoint does: the window it
 * drew, which may start later than the one asked about.
 *
 * Refused unless the window spans 28 or 90 days, as the backend refuses any
 * other span, and as `askedWindow` refuses, [today] included. A width
 * [byWidth] does not hold is refused too — a refusal the real endpoint does not
 * make, standing in for a page that asked about the wrong window.
 */
export function weightTimelineByWidth(
  byWidth: Partial<Record<Width, Timeline | null>>,
  { today }: { today?: string } = {},
) {
  return http.get('/api/weight-timeline', ({ query, response }) => {
    const window = askedWindow(query, { today })
    if ('refused' in window) {
      return response(400).json({ message: window.refused })
    }
    if (window.days !== 28 && window.days !== 90) {
      return response(400).json({
        message: 'a Weight Timeline is read over [28, 90] days',
      })
    }
    const timeline = byWidth[window.days]
    if (timeline === undefined) {
      return response(400).json({
        message: `no timeline ${window.days} days wide`,
      })
    }
    return timeline === null
      ? response(404).json({
          message: 'a Weight Timeline needs at least a fortnight of readings',
        })
      : response(200).json(timeline)
  })
}

/** [timeline] whichever width is asked about — or for null, withheld. */
export function weightTimelineOf(
  timeline: Timeline | null,
  options: { today?: string } = {},
) {
  return weightTimelineByWidth({ 28: timeline, 90: timeline }, options)
}

/** A Weight Timeline read the server fails while [isDown] holds. */
export function weightTimelineFails(isDown: () => boolean = () => true) {
  return failingRead('/api/weight-timeline', isDown)
}

/**
 * Withheld: the baseline's one reading is short of the fortnight a timeline
 * needs.
 */
export const weightTimelineHandlers = [weightTimelineOf(null)]
