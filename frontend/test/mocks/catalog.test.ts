import { describe, expect, it } from 'vitest'
import type { components } from '#open-fetch-schemas/api'
import { food, recipe } from '../food-fixtures'
import { foodCatalog } from './handlers/catalog'
import { server, useMswServer } from './node'

useMswServer()

type CreateRecipeRequest = components['schemas']['CreateRecipeRequest']

describe('foodCatalog', () => {
  it("lists Foods as the backend's SQL lower() orders them, which folds ASCII alone", async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({ id: 1, name: 'éclair' }),
          food({ id: 2, name: 'Énergy bar' }),
          food({ id: 3, name: 'Apple' }),
        ],
      }),
    )

    const listed = await useNuxtApp().$api('/api/foods')

    // An accented capital is left as it is, so "É" (U+00C9) sorts before "é"
    // (U+00E9) whatever follows it.
    expect(listed.map((f) => f.name)).toEqual(['Apple', 'Énergy bar', 'éclair'])
  })

  it('takes back the borrow of a Food it does not hold as the absent delete it is: 204', async () => {
    server.use(...foodCatalog())

    const answer = await fetch(
      `${location.origin}/api/foods/999/reference-food`,
      { method: 'DELETE' },
    )

    expect(answer.status).toBe(204)
  })

  it('lists a saved Recipe with its calories and protein conserved over the cooked weight', async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({
            id: 1,
            name: 'Mince',
            caloriesPer100g: 170,
            proteinPer100g: 20,
          }),
          food({
            id: 2,
            name: 'Potato',
            caloriesPer100g: 77,
            proteinPer100g: 2,
          }),
        ],
      }),
    )

    await useNuxtApp().$api('/api/recipes', {
      method: 'POST',
      body: {
        name: 'Cottage pie',
        cookedWeightG: 800,
        ingredients: [
          { foodId: 1, grams: 500 },
          { foodId: 2, grams: 600 },
        ],
        tagIds: [],
      },
    })
    const listed = await useNuxtApp().$api('/api/foods')

    // (850 + 462) kcal and (100 + 12) g protein, over 800 g cooked.
    expect(listed.find((f) => f.name === 'Cottage pie')).toEqual(
      recipe({
        id: 3,
        name: 'Cottage pie',
        caloriesPer100g: 164,
        proteinPer100g: 14,
        cookedWeightG: 800,
        ingredientCount: 2,
      }),
    )
  })

  it("reads a saved Recipe's composition back: its lines in the order weighed in, and its Tags", async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({ id: 1, name: 'Potato' }),
          food({ id: 2, name: 'Mince' }),
        ],
        tags: [{ id: 7, name: 'dinner' }],
      }),
    )

    const saved = await useNuxtApp().$api('/api/recipes', {
      method: 'POST',
      body: {
        name: 'Cottage pie',
        cookedWeightG: 800,
        ingredients: [
          { foodId: 2, grams: 500 },
          { foodId: 1, grams: 600 },
        ],
        tagIds: [7],
      },
    })
    const composition = await useNuxtApp().$api('/api/recipes/{id}', {
      path: { id: saved.id },
    })

    expect(composition).toEqual({
      id: saved.id,
      name: 'Cottage pie',
      cookedWeightG: 800,
      ingredients: [
        { foodId: 2, name: 'Mince', grams: 500 },
        { foodId: 1, name: 'Potato', grams: 600 },
      ],
      tags: [{ id: 7, name: 'dinner' }],
    })
  })

  it.each([
    ['a plain Food', 1],
    ['an id it does not hold', 99],
  ])('answers a composition read of %s 404', async (_, id) => {
    server.use(...foodCatalog({ foods: [food({ id: 1, name: 'Potato' })] }))

    const answer = await fetch(`${location.origin}/api/recipes/${id}`)

    expect(answer.status).toBe(404)
  })

  it('reads the composition of a Recipe it was seeded with', async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({ id: 1, name: 'Potato' }),
          recipe({
            id: 2,
            name: 'Mash',
            cookedWeightG: 450,
            ingredientCount: 1,
          }),
        ],
        compositions: { 2: [{ foodId: 1, grams: 500 }] },
      }),
    )

    const composition = await useNuxtApp().$api('/api/recipes/{id}', {
      path: { id: 2 },
    })

    expect(composition).toEqual({
      id: 2,
      name: 'Mash',
      cookedWeightG: 450,
      ingredients: [{ foodId: 1, name: 'Potato', grams: 500 }],
      tags: [],
    })
  })

  it('refuses a seeded composition its Recipe row counts differently', () => {
    expect(() =>
      foodCatalog({
        foods: [
          food({ id: 1, name: 'Potato' }),
          recipe({
            id: 2,
            name: 'Mash',
            cookedWeightG: 450,
            ingredientCount: 2,
          }),
        ],
        compositions: { 2: [{ foodId: 1, grams: 500 }] },
      }),
    ).toThrow('Mash counts 2 ingredients but is composed of 1')
  })

  it.each([
    ['a plain Food', 1, 'Food 1 is not a Recipe to compose'],
    ['an id it does not hold', 9, 'Food 9 is not a Recipe to compose'],
  ])('refuses a composition seeded under %s', (_, id, refusal) => {
    expect(() =>
      foodCatalog({
        foods: [food({ id: 1, name: 'Potato' })],
        compositions: { [id]: [{ foodId: 1, grams: 500 }] },
      }),
    ).toThrow(refusal)
  })

  it.each([
    ['a Food it does not hold', 9],
    ['another Recipe', 3],
  ])('refuses a seeded composition weighing in %s', (_, foodId) => {
    expect(() =>
      foodCatalog({
        foods: [
          recipe({
            id: 2,
            name: 'Mash',
            cookedWeightG: 450,
            ingredientCount: 1,
          }),
          recipe({
            id: 3,
            name: 'Gravy',
            cookedWeightG: 100,
            ingredientCount: 1,
          }),
          food({ id: 1, name: 'Potato' }),
        ],
        compositions: {
          2: [{ foodId, grams: 500 }],
          3: [{ foodId: 1, grams: 100 }],
        },
      }),
    ).toThrow(`Mash weighs in Food ${foodId}, which is not a plain Food here`)
  })

  it('updates a Recipe in place, re-rolling it from the composition it is sent', async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({
            id: 1,
            name: 'Potato',
            caloriesPer100g: 100,
            proteinPer100g: 2,
          }),
          food({
            id: 2,
            name: 'Butter',
            caloriesPer100g: 700,
            proteinPer100g: 1,
          }),
          recipe({
            id: 3,
            name: 'Mash',
            cookedWeightG: 450,
            ingredientCount: 1,
          }),
        ],
        compositions: { 3: [{ foodId: 1, grams: 500 }] },
      }),
    )

    await useNuxtApp().$api('/api/recipes/{id}', {
      method: 'PUT',
      path: { id: 3 },
      body: {
        name: 'Buttery mash',
        cookedWeightG: 500,
        ingredients: [
          { foodId: 1, grams: 500 },
          { foodId: 2, grams: 100 },
        ],
        tagIds: [],
      },
    })
    const listed = await useNuxtApp().$api('/api/foods')

    // (500 + 700) kcal and (10 + 1) g protein, over 500 g cooked.
    expect(listed.map((f) => f.name)).toEqual([
      'Butter',
      'Buttery mash',
      'Potato',
    ])
    expect(listed[1]).toEqual(
      recipe({
        id: 3,
        name: 'Buttery mash',
        caloriesPer100g: 240,
        proteinPer100g: 2.2,
        cookedWeightG: 500,
        ingredientCount: 2,
      }),
    )
  })

  /**
   * Sends "Mash" of [ingredients] carrying [tagIds] to [path] by [method],
   * answering the status — raw, so a refusal is read rather than thrown.
   */
  async function sendRecipe(
    method: 'POST' | 'PUT',
    path: string,
    body: Partial<CreateRecipeRequest>,
  ) {
    const answer = await fetch(`${location.origin}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Mash',
        cookedWeightG: 450,
        ingredients: [{ foodId: 1, grams: 500 }],
        tagIds: [],
        ...body,
      }),
    })
    return answer.status
  }

  const saveRecipe = (body: Partial<CreateRecipeRequest>) =>
    sendRecipe('POST', '/api/recipes', body)

  it.each([
    ['a plain Food', 1],
    ['an id it does not hold', 99],
  ])(
    'refuses an update of %s 404, leaving the catalog as it was',
    async (_, id) => {
      const potato = food({ id: 1, name: 'Potato' })
      server.use(...foodCatalog({ foods: [potato] }))

      const status = await sendRecipe('PUT', `/api/recipes/${id}`, {})

      expect(status).toBe(404)
      expect(await useNuxtApp().$api('/api/foods')).toEqual([potato])
    },
  )

  it('refuses a Recipe weighing in a Food it does not hold 404, saving nothing', async () => {
    const potato = food({ id: 1, name: 'Potato' })
    server.use(...foodCatalog({ foods: [potato] }))

    const status = await saveRecipe({
      ingredients: [
        { foodId: 1, grams: 500 },
        { foodId: 99, grams: 50 },
      ],
    })

    expect(status).toBe(404)
    expect(await useNuxtApp().$api('/api/foods')).toEqual([potato])
  })

  it('refuses a Recipe weighing in another Recipe 400, saving nothing', async () => {
    const stew = recipe({
      id: 1,
      name: 'Stew',
      cookedWeightG: 450,
      ingredientCount: 1,
    })
    const potato = food({ id: 2, name: 'Potato' })
    server.use(
      ...foodCatalog({
        foods: [stew, potato],
        compositions: { 1: [{ foodId: 2, grams: 500 }] },
      }),
    )

    const status = await saveRecipe({
      ingredients: [{ foodId: 1, grams: 500 }],
    })

    expect(status).toBe(400)
    expect(await useNuxtApp().$api('/api/foods')).toEqual([potato, stew])
  })

  it('refuses a Recipe line by line: a Recipe weighed in before a Food it does not hold is the 400', async () => {
    server.use(
      ...foodCatalog({
        foods: [
          recipe({
            id: 1,
            name: 'Stew',
            cookedWeightG: 450,
            ingredientCount: 1,
          }),
          food({ id: 2, name: 'Potato' }),
        ],
        compositions: { 1: [{ foodId: 2, grams: 500 }] },
      }),
    )

    const status = await saveRecipe({
      ingredients: [
        { foodId: 1, grams: 500 },
        { foodId: 99, grams: 50 },
      ],
    })

    expect(status).toBe(400)
  })

  it('refuses a Recipe carrying a Tag it does not hold 404, saving nothing', async () => {
    const potato = food({ id: 1, name: 'Potato' })
    server.use(
      ...foodCatalog({ foods: [potato], tags: [{ id: 7, name: 'dinner' }] }),
    )

    const status = await saveRecipe({ tagIds: [7, 8] })

    expect(status).toBe(404)
    expect(await useNuxtApp().$api('/api/foods')).toEqual([potato])
  })

  it('refuses deleting a Food a Recipe weighs in 400, naming each Recipe in SQL byte order', async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({ id: 1, name: 'Potato' }),
          recipe({
            id: 2,
            name: 'apple pie',
            cookedWeightG: 450,
            ingredientCount: 1,
          }),
          recipe({
            id: 3,
            name: 'Stew',
            cookedWeightG: 450,
            ingredientCount: 1,
          }),
        ],
        compositions: {
          2: [{ foodId: 1, grams: 500 }],
          3: [{ foodId: 1, grams: 500 }],
        },
      }),
    )

    const answer = await fetch(`${location.origin}/api/foods/1`, {
      method: 'DELETE',
    })

    // ORDER BY name with no collation compares bytes: every capital first.
    expect(answer.status).toBe(400)
    expect(await answer.json()).toEqual({
      message:
        "Potato is an ingredient of Stew, apple pie and can't be deleted.",
    })
    expect((await useNuxtApp().$api('/api/foods')).map((f) => f.name)).toEqual([
      'apple pie',
      'Potato',
      'Stew',
    ])
  })

  it('deletes an ingredient once the Recipe weighing it in is gone', async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({ id: 1, name: 'Potato' }),
          recipe({
            id: 2,
            name: 'Mash',
            cookedWeightG: 450,
            ingredientCount: 1,
          }),
        ],
        compositions: { 2: [{ foodId: 1, grams: 500 }] },
      }),
    )

    await useNuxtApp().$api('/api/foods/{id}', {
      method: 'DELETE',
      path: { id: 2 },
    })
    const answer = await fetch(`${location.origin}/api/foods/1`, {
      method: 'DELETE',
    })

    expect(answer.status).toBe(204)
    expect(await useNuxtApp().$api('/api/foods')).toEqual([])
  })

  it('refuses a Recipe weighing in a line of no grams 400, saving nothing', async () => {
    const potato = food({ id: 1, name: 'Potato' })
    server.use(...foodCatalog({ foods: [potato] }))

    const status = await saveRecipe({ ingredients: [{ foodId: 1, grams: 0 }] })

    expect(status).toBe(400)
    expect(await useNuxtApp().$api('/api/foods')).toEqual([potato])
  })

  it('refuses a Recipe with a blank name 400, saving nothing', async () => {
    const potato = food({ id: 1, name: 'Potato' })
    server.use(...foodCatalog({ foods: [potato] }))

    const status = await saveRecipe({ name: '  ' })

    expect(status).toBe(400)
    expect(await useNuxtApp().$api('/api/foods')).toEqual([potato])
  })

  it('refuses a Recipe with no ingredients 400, saving nothing', async () => {
    const potato = food({ id: 1, name: 'Potato' })
    server.use(...foodCatalog({ foods: [potato] }))

    const status = await saveRecipe({ ingredients: [] })

    expect(status).toBe(400)
    expect(await useNuxtApp().$api('/api/foods')).toEqual([potato])
  })

  it('refuses a Recipe cooked to no weight 400, saving nothing', async () => {
    const potato = food({ id: 1, name: 'Potato' })
    server.use(...foodCatalog({ foods: [potato] }))

    const status = await saveRecipe({ cookedWeightG: 0 })

    expect(status).toBe(400)
    expect(await useNuxtApp().$api('/api/foods')).toEqual([potato])
  })

  it('names two Recipes of one name once when refusing to delete their ingredient', async () => {
    server.use(
      ...foodCatalog({
        foods: [
          food({ id: 1, name: 'Potato' }),
          recipe({
            id: 2,
            name: 'Stew',
            cookedWeightG: 450,
            ingredientCount: 1,
          }),
          recipe({
            id: 3,
            name: 'Stew',
            cookedWeightG: 900,
            ingredientCount: 1,
          }),
        ],
        compositions: {
          2: [{ foodId: 1, grams: 500 }],
          3: [{ foodId: 1, grams: 1000 }],
        },
      }),
    )

    const answer = await fetch(`${location.origin}/api/foods/1`, {
      method: 'DELETE',
    })

    expect(await answer.json()).toEqual({
      message: "Potato is an ingredient of Stew and can't be deleted.",
    })
  })
})
