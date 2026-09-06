import { describe, expect, it } from 'vitest'
import { food } from '~~/test/food-fixtures'
import {
  CATALOG_ADD_ROUTE,
  filterFoods,
  formatPer100g,
  logFoodLabel,
  opensAddSheet,
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

describe('filtering the catalog', () => {
  const oats = food({ id: 1, name: 'Rolled oats' })
  const tuna = food({ id: 2, name: 'Tinned tuna' })
  const oil = food({ id: 3, name: 'Olive oil' })
  const foods = [oats, tuna, oil]

  it('keeps the Foods whose name contains the query, whatever its case', () => {
    // Both sides folded: the query's case and the *name's*. Every name in a
    // catalog is capitalised, so folding one side alone loses every query typed
    // from the start of a name.
    expect(filterFoods(foods, 'TUN')).toEqual([tuna])
    expect(filterFoods(foods, 'tinned')).toEqual([tuna])
  })

  it('finds an accented Food by the letters a User can type', () => {
    // Otherwise a Food is unreachable from the surface that exists to reach it,
    // by every spelling but the one it was entered in.
    const creme = food({ id: 4, name: 'Crème fraîche' })

    expect(filterFoods([...foods, creme], 'creme fraiche')).toEqual([creme])
    // And the other way round, which no mutant can ask for: Stryker swaps a
    // normalising call rather than deleting it, so stripping accents from the
    // stored name alone scores the same. A User who does reach the grave — an
    // iOS long-press, a paste — must still find their own Food.
    expect(filterFoods([...foods, creme], 'crème')).toEqual([creme])
  })

  it('keeps the order the backend sent, rather than sorting again', () => {
    // The catalog arrives ordered by name (ADR 0002 — the client sorts
    // nothing), and a filter that reordered it would answer a question nobody
    // asked.
    expect(filterFoods([oil, tuna, oats], 'o')).toEqual([oil, oats])
  })

  it('holds nothing back for a query of whitespace alone', () => {
    // A space is not a question, and treating it as one would collapse the
    // Frequent Foods grid the moment a thumb brushed the space bar.
    expect(filterFoods(foods, '   ')).toEqual(foods)
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
})

describe('stating what a Food costs and returns', () => {
  it('reads as cost and return per 100 g, rounded', () => {
    expect(
      formatPer100g({ caloriesPer100g: 378.6, proteinPer100g: 13.2 }),
    ).toBe('379 kcal · 13 g protein /100g')
  })
})
