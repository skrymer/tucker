import type { components } from '#open-fetch-schemas/api'

type FoodResponse = components['schemas']['FoodResponse']

/**
 * The catalog, arriving with its Add sheet open — where the **Log** destination
 * sends a User whose catalog is empty (ADR 0028), since Log picks from what
 * exists and never creates a Food.
 *
 * One symbol rather than the query spelled out at both ends, so the agreement
 * between the link and the page that reads it is executable (as `exits.ts` makes
 * the service worker's).
 */
export const CATALOG_ADD_ROUTE = '/foods?add=1'

/** Whether a route's query asks the catalog to open its Add sheet on arrival. */
export function opensAddSheet(query: Record<string, unknown>): boolean {
  return query.add === '1'
}

/**
 * The catalog narrowed to a query, matched on name.
 *
 * Case and accents are folded on **both** sides, because a Food is unreachable
 * from the only surface that logs it if it can be found solely by the spelling
 * it was typed in: nobody looking for `Crème fraîche` on a phone reaches for the
 * grave first. A query of whitespace alone holds nothing back, so a stray space
 * cannot collapse the **Frequent Foods** grid.
 *
 * Filtering is the client's here only because the catalog is already in hand;
 * a backend search is out of scope for F16, so there is no endpoint to call.
 */
export function filterFoods(
  foods: FoodResponse[],
  query: string,
): FoodResponse[] {
  const needle = fold(query)
  return foods.filter((food) => fold(food.name).includes(needle))
}

/** A name reduced to what a User can be expected to type: no case, no accents. */
function fold(text: string): string {
  return text
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * What a control that logs this Food is called, e.g. `Log Weekday chilli, a
 * recipe`. A Recipe is marked in the *name* and not only by the pot icon beside
 * it, which is nothing at all to a screen reader. Shared by the Log
 * destination's two surfaces — the only two there are — so the wording cannot
 * drift between them.
 */
export function logFoodLabel(
  food: Pick<FoodResponse, 'name' | 'kind'>,
): string {
  const name = formatName(food.name)
  return food.kind === 'RECIPE' ? `Log ${name}, a recipe` : `Log ${name}`
}

/**
 * What a Food costs and returns per 100 g, e.g. `379 kcal · 13 g protein /100g`
 * — the same cost-and-return wording an Entry uses, against the weight Food
 * nutrition is stored at. Shared by every surface that lists a Food, so the
 * three cannot round or punctuate it differently.
 */
export function formatPer100g(food: {
  caloriesPer100g: number
  proteinPer100g: number
}): string {
  return `${formatIntakeFigures(food.caloriesPer100g, food.proteinPer100g)} /100g`
}
