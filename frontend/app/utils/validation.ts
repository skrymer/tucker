import { z } from 'zod'

/**
 * The Weighed-entry grams rule — required, positive — shared by every form
 * that asks for a weight in grams (Weighed tab, "log it now", catalog log
 * sheet), so the rule and its messages can't drift apart.
 */
export const gramsSchema = z
  .number({ error: 'Enter the weight in grams' })
  .positive('Grams must be greater than 0')
