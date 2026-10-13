import { z } from 'zod'

/**
 * The grams rule — required, positive — shared by every form that asks for a
 * weight in grams (logging a Food, weighing a recipe ingredient), so the rule
 * and its messages can't drift apart.
 */
export const gramsSchema = z
  .number({ error: 'Enter the weight in grams' })
  .positive('Grams must be greater than 0')

/**
 * A plain Food's fields — its name and the three macros its calories are derived
 * from — shared by adding a Food and correcting one, so a correction can't
 * leave a Food worse than adding it could.
 */
export const foodSchema = z.object({
  name: z
    .string()
    .refine((name) => name.trim() !== '', 'Enter a name for this food'),
  proteinPer100g: z.number({ error: 'Enter protein per 100 g' }),
  carbsPer100g: z.number({ error: 'Enter carbs per 100 g' }),
  fatPer100g: z.number({ error: 'Enter fat per 100 g' }),
})
