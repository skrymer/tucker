import type { components } from '#open-fetch-schemas/api'
import { intakeBreakdown } from '../../intake-breakdown-fixtures'
import { askedWindow, failingRead, http, type AskedWindow } from '../http'

type Breakdown = components['schemas']['IntakeBreakdownResponse']

/** A window with nothing logged in it. */
export const nothingLogged = intakeBreakdown({
  totalCalories: 0,
  loggedDays: 0,
  items: [],
})

/**
 * The Intake Breakdown [answer] gives for each window asked about, stating that
 * window as the real endpoint does. Refused as `askedWindow` refuses, [today]
 * included; an [answer] of undefined is a refusal too, standing in for a page
 * that asked the wrong question.
 */
export function intakeBreakdownOf(
  answer: Breakdown | ((window: AskedWindow) => Breakdown | undefined),
  { today }: { today?: string } = {},
) {
  return http.get('/api/intake-breakdown', ({ query, response }) => {
    const window = askedWindow(query, { today })
    if ('refused' in window) {
      return response(400).json({ message: window.refused })
    }
    const breakdown = typeof answer === 'function' ? answer(window) : answer
    if (!breakdown) {
      return response(400).json({
        message: `no breakdown for ${window.from}..${window.to}`,
      })
    }
    return response(200).json({
      ...breakdown,
      from: window.from,
      to: window.to,
    })
  })
}

/**
 * [day] for a one-day window and [week] for a seven-day one — the two periods
 * `/review` offers — refusing any other width, and any window not ending on
 * [today].
 */
export function intakeBreakdownByPeriod(
  { day, week }: { day: Breakdown; week: Breakdown },
  { today }: { today: string },
) {
  return intakeBreakdownOf(
    ({ days }) => (days === 1 ? day : days === 7 ? week : undefined),
    { today },
  )
}

/** An Intake Breakdown read the server fails while [isDown] holds. */
export function intakeBreakdownFails(isDown: () => boolean = () => true) {
  return failingRead('/api/intake-breakdown', isDown)
}

export const intakeBreakdownHandlers = [intakeBreakdownOf(nothingLogged)]
