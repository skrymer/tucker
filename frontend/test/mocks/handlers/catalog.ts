import type { components } from '#open-fetch-schemas/api'
import { food, recipe, type FoodResponse } from '../../food-fixtures'
import { http } from '../http'

type Tag = components['schemas']['TagResponse']
type HeldTag = components['schemas']['FoodTagResponse']
type Candidate = components['schemas']['FoodCandidateResponse']

/** A Reference Food a Food can borrow its micronutrients from. */
export type ReferenceFood = { id: number; name: string }

/** A Tag as a test states it: its count defaults to the Foods carrying it. */
export type ShelvedTag = Omit<Tag, 'foodCount'> & { foodCount?: number }

/**
 * What Kotlin's `trim()` strips, which is what the server's `TagName` trims —
 * stated here rather than borrowed from the app, since the mock stands for the
 * server the app has to agree with.
 */
const KOTLIN_WHITESPACE =
  '\\t\\n\\u000B\\f\\r\\u001C-\\u001F \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000'
const EDGES = new RegExp(
  `^[${KOTLIN_WHITESPACE}]+|[${KOTLIN_WHITESPACE}]+$`,
  'g',
)

const fold = (name: string) => name.toLowerCase()
const foldAscii = (name: string) =>
  name.replace(/[A-Z]/g, (letter) => letter.toLowerCase())

const ordered =
  (key: (name: string) => string) =>
  (a: { name: string }, b: { name: string }) => {
    const [x, y] = [key(a.name), key(b.name)]
    return x < y ? -1 : x > y ? 1 : 0
  }

/** The order the backend lists Tags in: `TagName`'s, ignoring case in full. */
const byName = ordered(fold)

/**
 * The order the backend lists Foods in: SQL `lower()`, which folds ASCII
 * letters alone, so an accented capital keeps its place.
 */
export const byFoodName = ordered(foldAscii)

/** SQL `ORDER BY` with no collation: byte order, so every capital first. */
const inBytes = ordered((name) => name)

/** How the server refuses a Tag name over 30 characters. */
export const tagNameTooLong = 'a Tag name must be at most 30 characters'

/** A Tag name as `TagName` admits it, or the message it refuses it with. */
function tagName(given: string): { name: string } | { refused: string } {
  const name = given.replace(EDGES, '')
  if (!name) return { refused: 'a Tag name must not be blank' }
  if (name.length > 30) return { refused: tagNameTooLong }
  return { name }
}

type Row = Omit<FoodResponse, 'tags'> & { tagIds: number[] }
type Shelved = { id: number; name: string; offCatalog: number }
type Line = components['schemas']['CreateRecipeIngredient']
type RecipeRequest = components['schemas']['CreateRecipeRequest']

/**
 * A User's catalog as the backend keeps it: the Foods, the Tags they carry, the
 * Reference Foods they borrow from, and what a barcode looks up. Every write is
 * read back by the next read, so a test asserts the page after its re-read.
 *
 * - Foods are listed by name, ignoring the case of ASCII letters alone (SQL
 *   `lower()`). Saving one derives its calories from its macros (Atwater) and
 *   refuses a Tag the User does not have.
 *   Deleting one that has [logged] Entries, or that a Recipe weighs in, is
 *   refused, naming it — which is also what keeps every composition readable.
 * - A Recipe is a Food row, composed of the lines [compositions] holds under
 *   its id; a seed whose lines a Recipe row could not have is refused. Saving
 *   one rolls its calories and protein up over the cooked weight (ADR 0019).
 *   It is refused as the backend refuses it, in the backend's order: line by
 *   line, a Food the User does not have (404), no grams or a Recipe as the
 *   ingredient (400); then a blank name, no lines or no cooked weight (400);
 *   then a Tag they do not have (404). Reading or updating an id that is not a
 *   Recipe is a 404.
 * - Tags are listed by name ignoring case, each counted by the Foods carrying
 *   it — plus, where a [tags] entry states a `foodCount`, Foods outside this
 *   catalog that make up the difference. Creating a name the User already has
 *   in any case answers with that Tag; renaming onto one merges into it.
 *   A name is trimmed as the server trims it and refused past 30 characters.
 *   Created Tags are numbered from 20, or from one past the highest id given.
 *   A Tag a [foods] entry carries is on the shelf even if [tags] omits it.
 * - A barcode finds the catalog's Food carrying it, then a provider
 *   [candidates] entry, and otherwise misses.
 *
 * Built per test: the state is the test's own.
 */
export function foodCatalog({
  foods = [],
  tags = [],
  candidates = [],
  referenceFoods = [],
  logged = [],
  compositions: seeded = {},
}: {
  foods?: FoodResponse[]
  tags?: ShelvedTag[]
  candidates?: Candidate[]
  referenceFoods?: ReferenceFood[]
  logged?: number[]
  compositions?: Record<number, Line[]>
} = {}) {
  const rows: Row[] = foods.map(({ tags: held = [], ...rest }) => ({
    ...rest,
    tagIds: held.map((tag) => tag.id),
  }))
  const carriers = (id: number) =>
    rows.filter((row) => row.tagIds.includes(id)).length

  const shelf = new Map<number, Shelved>()
  for (const held of foods.flatMap((f) => f.tags ?? [])) {
    shelf.set(held.id, { ...held, offCatalog: 0 })
  }
  for (const { id, name, foodCount } of tags) {
    const offCatalog = foodCount === undefined ? 0 : foodCount - carriers(id)
    if (offCatalog < 0) {
      throw new Error(`${name} is counted on fewer Foods than carry it`)
    }
    shelf.set(id, { id, name, offCatalog })
  }

  let nextFoodId = Math.max(0, ...rows.map((row) => row.id)) + 1
  let nextTagId = Math.max(19, ...shelf.keys()) + 1

  const counted = ({ id, name, offCatalog }: Shelved): Tag => ({
    id,
    name,
    foodCount: offCatalog + carriers(id),
  })
  const described = ({ tagIds, ...row }: Row): FoodResponse => ({
    ...row,
    tags: tagIds
      .map((id) => shelf.get(id))
      .filter((tag): tag is Shelved => tag !== undefined)
      .map(({ id, name }): HeldTag => ({ id, name }))
      .sort(byName),
  })
  const rowOf = (id: string | number) =>
    rows.find((row) => row.id === Number(id))
  const shelved = (ids: number[]) => ids.every((id) => shelf.has(id))
  const distinct = (ids: number[]) => [...new Set(ids)]
  const named = (name: string) =>
    [...shelf.values()].find((tag) => fold(tag.name) === fold(name))

  const compositions = new Map<number, Line[]>(
    Object.entries(seeded).map(([id, lines]) => [Number(id), lines]),
  )
  for (const [id, lines] of compositions) {
    const row = rowOf(id)
    if (row?.kind !== 'RECIPE') {
      throw new Error(`Food ${id} is not a Recipe to compose`)
    }
    const unheld = lines.find(({ foodId }) => rowOf(foodId)?.kind !== 'FOOD')
    if (unheld) {
      throw new Error(
        `${row.name} weighs in Food ${unheld.foodId}, which is not a plain Food here`,
      )
    }
    if (row.ingredientCount !== lines.length) {
      throw new Error(
        `${row.name} counts ${row.ingredientCount} ingredients but is composed of ${lines.length}`,
      )
    }
  }

  /**
   * The Recipe row [id] as [request] composes it, its calories and protein
   * summed over the grams weighed in and re-expressed per 100 g of the cooked
   * weight, in the backend's order of operations (`Recipe.nutrition()`) — or
   * the refusal the backend would answer.
   */
  const compose = (
    id: number,
    request: RecipeRequest,
  ): { row: Row } | { status: 400 | 404; message: string } => {
    const { name, cookedWeightG, ingredients, tagIds } = request
    // Line by line, as the backend resolves them: the first line it cannot
    // take decides the refusal.
    for (const { foodId, grams } of ingredients) {
      const ingredient = rowOf(foodId)
      if (!ingredient) {
        return { status: 404, message: `no Food with id ${foodId}` }
      }
      if (!(grams > 0)) {
        return {
          status: 400,
          message: `ingredient grams must be > 0, was ${grams}`,
        }
      }
      if (ingredient.kind === 'RECIPE') {
        return {
          status: 400,
          message: 'a recipe ingredient must be a plain Food, not a RECIPE',
        }
      }
    }
    if (!name.replace(EDGES, '')) {
      return { status: 400, message: 'Recipe name must not be blank' }
    }
    if (ingredients.length === 0) {
      return { status: 400, message: 'a Recipe needs at least one ingredient' }
    }
    if (!(cookedWeightG > 0)) {
      return {
        status: 400,
        message: `cookedWeightG must be > 0, was ${cookedWeightG}`,
      }
    }
    if (!shelved(tagIds)) {
      return { status: 404, message: `no Tag among ${tagIds}` }
    }
    const total = (per100g: (row: Row) => number) =>
      ingredients.reduce(
        (sum, { foodId, grams }) =>
          sum + (per100g(rowOf(foodId)!) * grams) / 100,
        0,
      )
    const perCooked100g = 100 / cookedWeightG
    const row: Row = {
      ...recipe({
        id,
        name,
        caloriesPer100g: total((f) => f.caloriesPer100g) * perCooked100g,
        proteinPer100g: total((f) => f.proteinPer100g) * perCooked100g,
        cookedWeightG,
        ingredientCount: ingredients.length,
      }),
      tagIds: distinct(tagIds),
    }
    return { row }
  }

  return [
    http.get('/api/foods', ({ response }) =>
      response(200).json([...rows].sort(byFoodName).map(described)),
    ),
    http.post('/api/foods', async ({ request, response }) => {
      const { tagIds, barcode, ...macros } = await request.json()
      if (!shelved(tagIds)) {
        return response(404).json({ message: `no Tag among ${tagIds}` })
      }
      const { proteinPer100g: p, carbsPer100g: c, fatPer100g: f } = macros
      const row: Row = {
        ...food({ id: nextFoodId++, ...macros, barcode: barcode ?? null }),
        caloriesPer100g: 4 * p + 4 * c + 9 * f,
        tagIds: distinct(tagIds),
      }
      rows.push(row)
      return response(201).json(described(row))
    }),
    http.delete('/api/foods/{id}', ({ params, response }) => {
      const row = rowOf(params.id)
      if (!row) return response(204).empty()
      if (logged.includes(row.id)) {
        return response(400).json({
          message: `${row.name} has logged Entries and can't be deleted.`,
        })
      }
      const usedIn = [...compositions]
        .filter(([, lines]) => lines.some((l) => l.foodId === row.id))
        .map(([id]) => rowOf(id)!)
        .sort(inBytes)
        .map(({ name }) => name)
        .filter((name, at, names) => names.indexOf(name) === at)
      if (usedIn.length > 0) {
        return response(400).json({
          message: `${row.name} is an ingredient of ${usedIn.join(', ')} and can't be deleted.`,
        })
      }
      rows.splice(rows.indexOf(row), 1)
      compositions.delete(row.id)
      return response(204).empty()
    }),
    http.put('/api/foods/{id}/tags', async ({ params, request, response }) => {
      const row = rowOf(params.id)
      if (!row) {
        return response(404).json({ message: `no Food with id ${params.id}` })
      }
      const { tagIds } = await request.json()
      if (!shelved(tagIds)) {
        return response(404).json({ message: `no Tag among ${tagIds}` })
      }
      row.tagIds = distinct(tagIds)
      return response(200).json(described(row))
    }),
    http.put(
      '/api/foods/{id}/reference-food',
      async ({ params, request, response }) => {
        const row = rowOf(params.id)
        if (!row) {
          return response(404).json({ message: `no Food with id ${params.id}` })
        }
        const { referenceFoodId } = await request.json()
        const borrowed = referenceFoods.find((r) => r.id === referenceFoodId)
        if (!borrowed) {
          return response(404).json({
            message: `no Reference Food with id ${referenceFoodId}`,
          })
        }
        row.referenceFoodId = borrowed.id
        row.referenceFoodName = borrowed.name
        return response(200).json(described(row))
      },
    ),
    // Idempotent, like every delete: an absent Food answers as a present one.
    http.delete('/api/foods/{id}/reference-food', ({ params, response }) => {
      const row = rowOf(params.id)
      if (row) {
        row.referenceFoodId = null
        row.referenceFoodName = null
      }
      return response(204).empty()
    }),
    http.post('/api/recipes', async ({ request, response }) => {
      const body = await request.json()
      const saved = compose(nextFoodId, body)
      if ('status' in saved) {
        return response(saved.status).json({ message: saved.message })
      }
      nextFoodId++
      rows.push(saved.row)
      compositions.set(saved.row.id, body.ingredients)
      return response(201).json(described(saved.row))
    }),
    http.put('/api/recipes/{id}', async ({ params, request, response }) => {
      const stored = rowOf(params.id)
      if (stored?.kind !== 'RECIPE') {
        return response(404).json({ message: `no recipe with id ${params.id}` })
      }
      const body = await request.json()
      const saved = compose(stored.id, body)
      if ('status' in saved) {
        return response(saved.status).json({ message: saved.message })
      }
      rows[rows.indexOf(stored)] = saved.row
      compositions.set(stored.id, body.ingredients)
      return response(200).json(described(saved.row))
    }),
    http.get('/api/recipes/{id}', ({ params, response }) => {
      const row = rowOf(params.id)
      if (row?.kind !== 'RECIPE') {
        return response(404).json({ message: `no recipe with id ${params.id}` })
      }
      const { tags } = described(row)
      return response(200).json({
        id: row.id,
        name: row.name,
        cookedWeightG: row.cookedWeightG!,
        ingredients: compositions.get(row.id)!.map(({ foodId, grams }) => ({
          foodId,
          name: rowOf(foodId)!.name,
          grams,
        })),
        tags,
      })
    }),
    http.get('/api/foods/barcode/{barcode}', ({ params, response }) => {
      const owned = rows.find((row) => row.barcode === params.barcode)
      if (owned) {
        return response(200).json({
          outcome: 'EXISTING',
          food: described(owned),
          candidate: null,
        })
      }
      const candidate = candidates.find((c) => c.barcode === params.barcode)
      if (candidate) {
        return response(200).json({
          outcome: 'CANDIDATE',
          food: null,
          candidate,
        })
      }
      return response(404).json({
        message: `no product for barcode ${params.barcode}`,
      })
    }),

    http.get('/api/tags', ({ response }) =>
      response(200).json([...shelf.values()].sort(byName).map(counted)),
    ),
    // A new Tag and one the User already had answer alike: the spec declares
    // no 201 for the create the backend answers with one.
    http.post('/api/tags', async ({ request, response }) => {
      const given = tagName((await request.json()).name)
      if ('refused' in given) {
        return response(400).json({ message: given.refused })
      }
      const existing = named(given.name)
      if (existing) return response(200).json(counted(existing))
      const tag = { id: nextTagId++, name: given.name, offCatalog: 0 }
      shelf.set(tag.id, tag)
      return response(200).json(counted(tag))
    }),
    http.put('/api/tags/{id}', async ({ params, request, response }) => {
      const renamed = shelf.get(Number(params.id))
      if (!renamed) {
        return response(404).json({ message: `no tag with id ${params.id}` })
      }
      const given = tagName((await request.json()).name)
      if ('refused' in given) {
        return response(400).json({ message: given.refused })
      }
      const into = [...shelf.values()].find(
        (tag) => tag.id !== renamed.id && fold(tag.name) === fold(given.name),
      )
      if (!into) {
        renamed.name = given.name
        return response(200).json({ tag: counted(renamed), merged: false })
      }
      for (const row of rows.filter((r) => r.tagIds.includes(renamed.id))) {
        row.tagIds = [
          ...new Set(
            row.tagIds.map((id) => (id === renamed.id ? into.id : id)),
          ),
        ]
      }
      into.offCatalog += renamed.offCatalog
      shelf.delete(renamed.id)
      return response(200).json({ tag: counted(into), merged: true })
    }),
    http.delete('/api/tags/{id}', ({ params, response }) => {
      const id = Number(params.id)
      shelf.delete(id)
      for (const row of rows) row.tagIds = row.tagIds.filter((t) => t !== id)
      return response(204).empty()
    }),
  ]
}
