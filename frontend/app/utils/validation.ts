import { z } from 'zod'

/**
 * The grams rule — required, positive — shared by every form that asks for a
 * weight in grams (logging a Food, weighing a recipe ingredient), so the rule
 * and its messages can't drift apart.
 */
export const gramsSchema = z
  .number({ error: 'Enter the weight in grams' })
  .positive('Grams must be greater than 0')

/** The three macros a User must supply for a Food, per 100 g, in the order a form asks. */
export const MACROS = ['proteinPer100g', 'carbsPer100g', 'fatPer100g'] as const
export type Macro = (typeof MACROS)[number]

/**
 * The figures a User may leave blank — fibre and alcohol: not stated, which is not
 * zero (ADR 0040). Alcohol is written as ABV; the server keeps it as grams.
 */
export const OPTIONAL_FIGURES = ['fibrePer100g', 'alcoholAbv'] as const
export type OptionalFigure = (typeof OPTIONAL_FIGURES)[number]

/** Every macro a User supplies for a Food: the three required ones, then the optional ones. */
export const FOOD_FIGURES = [...MACROS, ...OPTIONAL_FIGURES] as const
export type FoodFigure = (typeof FOOD_FIGURES)[number]

export function isOptionalFigure(figure: FoodFigure): figure is OptionalFigure {
  return (OPTIONAL_FIGURES as readonly FoodFigure[]).includes(figure)
}

export const MACRO_LABELS: Record<FoodFigure, string> = {
  proteinPer100g: 'Protein /100g',
  carbsPer100g: 'Carbs /100g',
  fatPer100g: 'Fat /100g',
  fibrePer100g: 'Fibre /100g',
  alcoholAbv: 'Alc % vol',
}

/**
 * A plain Food's fields — its name and the macros its calories are derived
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
  fibrePer100g: z.number().nonnegative('Fibre can’t be negative').nullish(),
  alcoholAbv: z
    .number()
    .nonnegative('Alcohol can’t be negative')
    .max(100, 'ABV can’t be over 100%')
    .nullish(),
})
