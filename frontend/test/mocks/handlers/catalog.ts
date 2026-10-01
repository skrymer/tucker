import type { components } from '#open-fetch-schemas/api'
import { food, type FoodResponse } from '../../food-fixtures'
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
const byName = (a: { name: string }, b: { name: string }) => {
  const [x, y] = [fold(a.name), fold(b.name)]
  return x < y ? -1 : x > y ? 1 : 0
}

/** A Tag name as `TagName` admits it, or the message it refuses it with. */
function tagName(given: string): { name: string } | { refused: string } {
  const name = given.replace(EDGES, '')
  if (!name) return { refused: 'a Tag name must not be blank' }
  if (name.length > 30) {
    return { refused: 'a Tag name must be at most 30 characters' }
  }
  return { name }
}

type Row = Omit<FoodResponse, 'tags'> & { tagIds: number[] }
type Shelved = { id: number; name: string; offCatalog: number }

/**
 * A User's catalog as the backend keeps it: the Foods, the Tags they carry, the
 * Reference Foods they borrow from, and what a barcode looks up. Every write is
 * read back by the next read, so a test asserts the page after its re-read.
 *
 * - Foods are listed by name ignoring case. Saving one derives its calories
 *   from its macros (Atwater) and refuses a Tag the User does not have.
 *   Deleting one that has [logged] Entries is refused, naming it.
 * - Tags are listed by name ignoring case, each counted by the Foods carrying
 *   it — plus, where a [tags] entry states a `foodCount`, Foods outside this
 *   catalog that make up the difference. Creating a name the User already has
 *   in any case answers with that Tag; renaming onto one merges into it.
 *   A name is trimmed as the server trims it and refused past 30 characters.
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
}: {
  foods?: FoodResponse[]
  tags?: ShelvedTag[]
  candidates?: Candidate[]
  referenceFoods?: ReferenceFood[]
  logged?: number[]
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
  const rowOf = (id: string) => rows.find((row) => row.id === Number(id))
  const shelved = (ids: number[]) => ids.every((id) => shelf.has(id))
  const named = (name: string) =>
    [...shelf.values()].find((tag) => fold(tag.name) === fold(name))

  return [
    http.get('/api/foods', ({ response }) =>
      response(200).json([...rows].sort(byName).map(described)),
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
        tagIds: [...new Set(tagIds)],
      }
      rows.push(row)
      return response(201).json(described(row))
    }),
    http.delete('/api/foods/{id}', ({ params, response }) => {
      const row = rowOf(params.id)
      if (row && logged.includes(row.id)) {
        return response(400).json({
          message: `${row.name} has logged Entries and can't be deleted.`,
        })
      }
      if (row) rows.splice(rows.indexOf(row), 1)
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
      row.tagIds = [...new Set(tagIds)]
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
    http.delete('/api/foods/{id}/reference-food', ({ params, response }) => {
      const row = rowOf(params.id)
      if (!row) {
        return response(404).json({ message: `no Food with id ${params.id}` })
      }
      row.referenceFoodId = null
      row.referenceFoodName = null
      return response(204).empty()
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
    // A new Tag and one the User already had answer alike, as the spec
    // declares no 201 for a create.
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
