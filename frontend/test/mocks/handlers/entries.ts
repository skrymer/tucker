import type { components } from '#open-fetch-schemas/api'
import { estimatedEntry, weighedEntry } from '../../entry-fixtures'
import type { FoodResponse } from '../../food-fixtures'
import { askedWindow, http, wrongDay } from '../http'
import { baselineCalorieBudget } from './summary'

/**
 * Logging an Entry on [today], gated by its Budget Projection against a
 * [calorieBudget] of which nothing is eaten yet on any day. A Weighed Entry's
 * calories and protein are its Food's per-100 g figures scaled by the grams
 * sent; an estimate echoes its label and figures. A Food not among [foods] is a
 * 404, as the real endpoint answers. An Entry dated any day but [today] is a
 * 400 the real endpoint does not send: it stands in for a page that stamped the
 * wrong day, so that page fails its test (ADR 0014). Given [tomorrow], an
 * Entry may be dated that day too (ADR 0035), and an Entry whose `clientToday`
 * is not [today] is a 400 for the same reason.
 *
 * Built per test: what is logged counts against its own day's Budget for the
 * next projection.
 */
export function entryLog({
  today,
  tomorrow,
  foods,
  calorieBudget = baselineCalorieBudget,
}: {
  today: string
  tomorrow?: string
  foods: FoodResponse[]
  calorieBudget?: number
}) {
  const consumed = new Map<string, number>()
  let nextId = 1

  const eat = (date: string, calories: number) =>
    consumed.set(date, (consumed.get(date) ?? 0) + calories)
  const projection = (date: string, calories: number) => {
    const projected = (consumed.get(date) ?? 0) + calories
    const over = projected > calorieBudget
    return {
      wouldExceedBudget: over,
      projectedCaloriesConsumed: projected,
      calorieBudget,
      overByKcal: over ? projected - calorieBudget : null,
    }
  }
  /** Why an Entry stamped with [date] and [clientToday] is refused, if it is. */
  const misdated = ({
    date,
    clientToday,
  }: {
    date: string
    clientToday?: string | null
  }) =>
    wrongDay(clientToday, today) ??
    (date === tomorrow ? null : wrongDay(date, today))
  /** A weighed portion of the Food [foodId], or null for a Food not held. */
  const weigh = (foodId: number, grams: number) => {
    const food = foods.find((f) => f.id === foodId)
    if (!food) return null
    return {
      food,
      calories: (food.caloriesPer100g * grams) / 100,
      protein: (food.proteinPer100g * grams) / 100,
    }
  }

  return [
    http.post('/api/entries/weighed/preview', async ({ request, response }) => {
      const { date, clientToday, foodId, grams } = await request.json()
      const refused = misdated({ date, clientToday })
      if (refused) return response(400).json(refused)
      const portion = weigh(foodId, grams)
      if (!portion) return response(404).json({ message: 'no such food' })
      return response(200).json(projection(date, portion.calories))
    }),
    http.post('/api/entries/weighed', async ({ request, response }) => {
      const { date, clientToday, foodId, grams } = await request.json()
      const refused = misdated({ date, clientToday })
      if (refused) return response(400).json(refused)
      const portion = weigh(foodId, grams)
      if (!portion) return response(404).json({ message: 'no such food' })
      eat(date, portion.calories)
      return response(201).json(
        weighedEntry({
          id: nextId++,
          loggedOn: date,
          foodId,
          foodName: portion.food.name,
          grams,
          calories: portion.calories,
          protein: portion.protein,
        }),
      )
    }),
    http.post(
      '/api/entries/estimated/preview',
      async ({ request, response }) => {
        const { date, clientToday, calories } = await request.json()
        const refused = misdated({ date, clientToday })
        if (refused) return response(400).json(refused)
        return response(200).json(projection(date, calories))
      },
    ),
    http.post('/api/entries/estimated', async ({ request, response }) => {
      const { date, clientToday, label, calories, protein } =
        await request.json()
      const refused = misdated({ date, clientToday })
      if (refused) return response(400).json(refused)
      eat(date, calories)
      return response(201).json(
        estimatedEntry({
          id: nextId++,
          loggedOn: date,
          label,
          calories,
          protein: protein ?? null,
        }),
      )
    }),
  ]
}

type EntryResponse = components['schemas']['EntryResponse']

/**
 * The day of the baseline User's first Entry: long before any day a test
 * reads, so a calendar bounded by it bounds nothing a test reaches.
 */
export const baselineFirstLoggedOn = '2025-01-06'

/** The widest range the logged-days read answers, as the backend caps it. */
const MAX_LOGGED_DAYS_RANGE = 62

/**
 * The Entries of each day, keyed by ISO date, read back a day at a time with
 * their calorie total; any other day has none. The days holding an Entry are
 * read back too, over a range refused as the backend refuses it, with the
 * User's first Entry — one more, on [since], unless [since] is null for a User
 * who has logged nothing. A deleted Entry leaves the day it was on, and a
 * delete of an id no day holds answers 204, as the real endpoint does.
 *
 * Built per test: deletions persist to the next read.
 */
export function dailyLogs(
  days: Record<string, EntryResponse[]> = {},
  { since = baselineFirstLoggedOn }: { since?: string | null } = {},
) {
  const held = Object.fromEntries(
    Object.entries(days).map(([date, entries]) => [date, [...entries]]),
  )
  if (since && !held[since]) {
    held[since] = [
      estimatedEntry({
        id: 9999,
        loggedOn: since,
        label: 'First meal',
        calories: 500,
        protein: null,
      }),
    ]
  }
  const logged = () =>
    Object.keys(held)
      .filter((date) => held[date]!.length > 0)
      .sort()
  return [
    http.get('/api/entries/days', ({ query, response }) => {
      const asked = askedWindow(query)
      if ('refused' in asked)
        return response(400).json({ message: asked.refused })
      if (asked.days > MAX_LOGGED_DAYS_RANGE) {
        return response(400).json({
          message: `a range must span at most ${MAX_LOGGED_DAYS_RANGE} days`,
        })
      }
      return response(200).json({
        days: logged().filter((d) => d >= asked.from && d <= asked.to),
        firstLoggedOn: logged()[0] ?? null,
      })
    }),
    http.get('/api/entries', ({ query, response }) => {
      const date = query.get('date')
      if (!date) return response(400).json({ message: 'date is required' })
      const entries = held[date] ?? []
      return response(200).json({
        date,
        entries,
        caloriesConsumed: entries.reduce((sum, e) => sum + e.calories, 0),
      })
    }),
    http.delete('/api/entries/{id}', ({ params, response }) => {
      for (const date of Object.keys(held)) {
        held[date] = held[date]!.filter((e) => e.id !== Number(params.id))
      }
      return response(204).empty()
    }),
  ]
}

export const entryHandlers = dailyLogs()
