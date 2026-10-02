import { getResponse, type RequestHandler } from 'msw'
import type { FoodResponse } from '../../food-fixtures'
import { micronutrientIntake } from '../../micronutrient-fixtures'
import { askedWindow, http } from '../http'

/** A Micronutrient Intake as a test states it: the fixture fills the rest. */
type IntakeOverrides = Parameters<typeof micronutrientIntake>[0]

/**
 * A week with nothing logged: no calories, so no share to state, calories
 * being what a coverage figure is a share of (ADR 0027).
 */
const nothingLoggedThisWeek: IntakeOverrides = {
  totalCalories: 0,
  loggedDays: 0,
  coverage: null,
  rows: [],
  unmatched: [],
}

/**
 * The Micronutrient Intake [answer] gives, completed by the response fixture so
 * no field the API always sends is missing, and stating the window asked about
 * as the real endpoint does. Refused unless the window spans seven days, as the
 * backend refuses any other span, and as `askedWindow` refuses, [today]
 * included.
 */
export function micronutrientIntakeOf(
  answer: IntakeOverrides | (() => IntakeOverrides | Promise<IntakeOverrides>),
  { today }: { today?: string } = {},
) {
  return http.get('/api/micronutrient-intake', async ({ query, response }) => {
    const window = askedWindow(query, { today })
    if ('refused' in window) {
      return response(400).json({ message: window.refused })
    }
    if (window.days !== 7) {
      return response(400).json({
        message: 'a Micronutrient Intake is read over the trailing 7 days',
      })
    }
    const overrides = typeof answer === 'function' ? await answer() : answer
    return response(200).json({
      ...micronutrientIntake(overrides),
      from: window.from,
      to: window.to,
    })
  })
}

/**
 * The Micronutrient Intake [answer] reads off [catalog]'s Foods as they stand
 * at each read — what the backend derives the queue from, so a match claimed
 * through the catalog moves the next read.
 */
export function micronutrientIntakeOver(
  catalog: RequestHandler[],
  answer: (foods: FoodResponse[]) => IntakeOverrides,
  options: { today?: string } = {},
) {
  return micronutrientIntakeOf(async () => {
    const read = await getResponse(
      catalog,
      new Request('http://localhost/api/foods'),
    )
    return answer((await read!.json()) as FoodResponse[])
  }, options)
}

export const micronutrientHandlers = [
  micronutrientIntakeOf(nothingLoggedThisWeek),
]
