import type { components } from '#open-fetch-schemas/api'

export type GoalPayload = Omit<
  components['schemas']['CreateGoalRequest'],
  'clientToday'
>

/** The backend's refusal of a Goal, by what it is about. */
export type GoalRefusal = { target?: string; rate?: string; form?: string }

/**
 * Each refusal lands on the input it names. One that names none is not about an
 * input at all — a skewed client clock, or no weight logged — so it goes above
 * the submit rather than under a field the user got right.
 */
export function refusalFor(
  message: string,
  field?: string | null,
): GoalRefusal {
  if (field === 'rateKgPerWeek') return { rate: message }
  if (field === 'targetWeightKg') return { target: message }
  return { form: message }
}
