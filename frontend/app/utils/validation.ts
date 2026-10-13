import { z } from 'zod'

/**
 * The grams rule — required, positive — shared by every form that asks for a
 * weight in grams (logging a Food, weighing a recipe ingredient), so the rule
 * and its messages can't drift apart.
 */
export const gramsSchema = z
  .number({ error: 'Enter the weight in grams' })
  .positive('Grams must be greater than 0')

/** The three macros a User supplies for a Food, per 100 g, in the order a form asks. */
export const MACROS = ['proteinPer100g', 'carbsPer100g', 'fatPer100g'] as const
export type Macro = (typeof MACROS)[number]

export const MACRO_LABELS: Record<Macro, string> = {
  proteinPer100g: 'Protein /100g',
  carbsPer100g: 'Carbs /100g',
  fatPer100g: 'Fat /100g',
}

/**
 * A plain Food's fields — its name and the three macros its calories are derived
 * from — shared by adding a Food and correcting one, so a correction can't
 * leave a Food worse than adding it could.
 */
export const foodSchema = z.object({
  name: z
    .string()
    .refine((name) => serverTrim(name) !== '', 'Enter a name for this food'),
  proteinPer100g: z.number({ error: 'Enter protein per 100 g' }),
  carbsPer100g: z.number({ error: 'Enter carbs per 100 g' }),
  fatPer100g: z.number({ error: 'Enter fat per 100 g' }),
})
