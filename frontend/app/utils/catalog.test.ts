import { describe, expect, it } from 'vitest'
import { food } from '~~/test/food-fixtures'
import {
  CATALOG_ADD_ROUTE,
  formatPer100g,
  logFoodLabel,
  narrowFoods,
  opensAddSheet,
  tagsOnOffer,
} from './catalog'

describe('the catalog hand-off', () => {
  it('reads the query its own link carries, so the two cannot drift apart', () => {
    const query = Object.fromEntries(
      new URLSearchParams(CATALOG_ADD_ROUTE.split('?')[1]),
    )

    expect(opensAddSheet(query)).toBe(true)
  })

  it('leaves the catalog closed when nothing asked for the sheet', () => {
    expect(opensAddSheet({})).toBe(false)
    expect(opensAddSheet({ add: '0' })).toBe(false)
  })
})

describe('narrowing the catalog by a query', () => {
  const oats = food({ id: 1, name: 'Rolled oats' })
  const tuna = food({ id: 2, name: 'Tinned tuna' })
  const oil = food({ id: 3, name: 'Olive oil' })
  const foods = [oats, tuna, oil]

  it('keeps the Foods whose name contains the query, whatever its case', () => {
    // Both sides folded: the query's case and the *name's*. Every name in a
    // catalog is capitalised, so folding one side alone loses every query typed
    // from the start of a name.
    expect(narrowFoods(foods, { query: 'TUN', tagId: null })).toEqual([tuna])
    expect(narrowFoods(foods, { query: 'tinned', tagId: null })).toEqual([tuna])
  })

  it('finds an accented Food by the letters a User can type', () => {
    // Otherwise a Food is unreachable from the surface that exists to reach it,
    // by every spelling but the one it was entered in.
    const creme = food({ id: 4, name: 'Crème fraîche' })

    expect(
      narrowFoods([...foods, creme], { query: 'creme fraiche', tagId: null }),
    ).toEqual([creme])
    // And the other way round, which no mutant can ask for: Stryker swaps a
    // normalising call rather than deleting it, so stripping accents from the
    // stored name alone scores the same. A User who does reach the grave — an
    // iOS long-press, a paste — must still find their own Food.
    expect(
      narrowFoods([...foods, creme], { query: 'crème', tagId: null }),
    ).toEqual([creme])
  })

  it('keeps the order the backend sent, rather than sorting again', () => {
    // The catalog arrives ordered by name (ADR 0002 — the client sorts
    // nothing), and a filter that reordered it would answer a question nobody
    // asked.
    expect(narrowFoods([oil, tuna, oats], { query: 'o', tagId: null })).toEqual(
      [oil, oats],
    )
  })

  it('holds nothing back for a query of whitespace alone', () => {
    // A space is not a question, and treating it as one would collapse the
    // Frequent Foods grid the moment a thumb brushed the space bar.
    expect(narrowFoods(foods, { query: '   ', tagId: null })).toEqual(foods)
  })
})

describe('narrowing the catalog to a Tag', () => {
  const breakfast = { id: 10, name: 'breakfast' }
  const dinner = { id: 11, name: 'dinner' }
  const oats = food({ id: 1, name: 'Rolled oats', tags: [breakfast] })
  const tuna = food({ id: 2, name: 'Tinned tuna', tags: [dinner] })
  const yoghurt = food({ id: 3, name: 'Yoghurt', tags: [breakfast, dinner] })
  const oil = food({ id: 4, name: 'Olive oil' })
  const foods = [oats, tuna, yoghurt, oil]

  it('keeps only the Foods carrying the chosen Tag', () => {
    expect(narrowFoods(foods, { query: '', tagId: breakfast.id })).toEqual([
      oats,
      yoghurt,
    ])
  })

  it('holds nothing back when no Tag is chosen and nothing is typed', () => {
    // "All" is the whole catalog, untagged Foods included.
    expect(narrowFoods(foods, { query: '', tagId: null })).toEqual(foods)
  })

  it('narrows by the Tag and the query together', () => {
    // Neither quietly undoes the other: "oat" alone would reach no dinner Food
    // here, and dinner alone would keep the tuna.
    expect(narrowFoods(foods, { query: 'YOG', tagId: dinner.id })).toEqual([
      yoghurt,
    ])
    expect(narrowFoods(foods, { query: 'oat', tagId: dinner.id })).toEqual([])
  })

  it("leaves a Tag's list whole for a query of whitespace alone", () => {
    expect(narrowFoods(foods, { query: '  ', tagId: breakfast.id })).toEqual([
      oats,
      yoghurt,
    ])
  })
})

describe('the Tags offered to narrow by', () => {
  it('offers each Tag carrying a Food once, alphabetically ignoring case', () => {
    const snack = { id: 1, name: 'snack' }
    const brunch = { id: 2, name: 'Brunch' }
    const dinner = { id: 3, name: 'dinner' }
    const foods = [
      food({ id: 1, name: 'Almonds', tags: [snack] }),
      food({ id: 2, name: 'Eggs', tags: [brunch, dinner] }),
      food({ id: 3, name: 'Tuna', tags: [dinner] }),
      food({ id: 4, name: 'Olive oil' }),
    ]

    expect(tagsOnOffer(foods)).toEqual([brunch, dinner, snack])
  })

  it("orders accented Tags by the backend's rule, not the browser's collation", () => {
    // `TagName` lower-cases and compares code unit by code unit, which puts
    // every accented initial after `z`. A Food's own Tags arrive in that order,
    // so a locale-aware sort here would list the same Tags two ways.
    const tags = ['Zucchini', 'écru', 'apple', 'Éclair'].map((name, i) => ({
      id: i + 1,
      name,
    }))
    const foods = [food({ id: 1, name: 'Anything', tags })]

    expect(tagsOnOffer(foods).map((tag) => tag.name)).toEqual([
      'apple',
      'Zucchini',
      'Éclair',
      'écru',
    ])
  })
})

describe('naming the log action', () => {
  it('names the Food the action logs', () => {
    expect(logFoodLabel({ name: 'Rolled oats', kind: 'FOOD' })).toBe(
      'Log Rolled oats',
    )
  })

  it('says a Recipe is one, so the pot icon is not the only marker', () => {
    // An icon is nothing at all to a screen reader, and both logging surfaces
    // name it the same way rather than each choosing its own wording.
    expect(logFoodLabel({ name: 'Weekday chilli', kind: 'RECIPE' })).toBe(
      'Log Weekday chilli, a recipe',
    )
  })

  it('names the Food in sentence case however it was typed', () => {
    expect(logFoodLabel({ name: 'LIGHT MILK', kind: 'FOOD' })).toBe(
      'Log Light milk',
    )
  })
})

describe('stating what a Food costs and returns', () => {
  it('reads as cost and return per 100 g, rounded', () => {
    expect(
      formatPer100g({ caloriesPer100g: 378.6, proteinPer100g: 13.2 }),
    ).toBe('379 kcal · 13 g protein /100g')
  })
})
