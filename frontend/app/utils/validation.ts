import { z } from 'zod'

/**
 * The grams rule — required, positive — shared by every form that asks for a
 * weight in grams (logging a Food, weighing a recipe ingredient), so the rule
 * and its messages can't drift apart.
 */
export const gramsSchema = z
  .number({ error: 'Enter the weight in grams' })
  .positive('Grams must be greater than 0')
