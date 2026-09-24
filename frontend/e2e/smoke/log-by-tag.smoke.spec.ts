import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { expectCreated, expectStatus } from './support/seeding'
import { entryRow } from '../support/entry-row'
import { enterGrams, pickFoodToLog } from '../support/log-page'

// F18 slice 2 smoke: Log narrowed by a Tag against the real backend. Tags two
// Foods over the API, then narrows Log by that Tag and logs one of them. What
// only the real stack can show is that the chips come from the Tags each Food
// already carries on `GET /api/foods` — so a Tag carrying nothing, which
// `GET /api/tags` would list, is never offered. The per-test reset wipes the
// seed, so there is no cleanup.
const API = 'http://localhost:8080/api'

/** POSTs and returns the created row's id. */
async function create(
  request: APIRequestContext,
  path: string,
  data: object,
): Promise<number> {
  const created = request.post(`${API}${path}`, { data })
  await expectCreated(created)
  return (await (await created).json()).id as number
}

/**
 * A Food whose macros make 57.8 kcal per 100 g under Atwater — the figure the
 * last assertion is read against, derived by the backend and never sent.
 */
const createFood = (request: APIRequestContext, name: string) =>
  create(request, '/foods', {
    name,
    proteinPer100g: 10,
    carbsPer100g: 4,
    fatPer100g: 0.2,
    tagIds: [],
  })

test('a Tag narrows Log to the Foods carrying it, and one is logged from there', async ({
  page,
  goto,
  request,
}) => {
  const oats = await createFood(request, 'Rolled oats')
  const eggs = await createFood(request, 'Free-range eggs')
  await createFood(request, 'Weekday chilli')
  const breakfast = await create(request, '/tags', { name: 'breakfast' })
  await create(request, '/tags', { name: 'Snack' })
  for (const food of [oats, eggs]) {
    await expectStatus(
      request.put(`${API}/foods/${food}/tags`, {
        data: { tagIds: [breakfast] },
      }),
      200,
    )
  }

  await goto('/log', { waitUntil: 'hydration' })

  const chips = page.getByRole('group', { name: 'Filter by tag' })
  await expect(chips.getByRole('button')).toHaveText(['All', 'breakfast'])

  await chips.getByRole('button', { name: 'breakfast' }).click()

  await expect(
    page.getByRole('region', { name: 'breakfast foods' }).getByRole('button'),
  ).toHaveText([/Free-range eggs/, /Rolled oats/])

  const sheet = await pickFoodToLog(page, {
    section: 'breakfast foods',
    food: 'Rolled oats',
  })
  await enterGrams(page, sheet, 80)
  await sheet.getByRole('button', { name: /log entry/i }).click()
  await expect(sheet).toBeHidden()

  // 57.8 kcal/100 g derived by the backend, so 80 g is 46.
  await goto('/', { waitUntil: 'hydration' })
  await expect(entryRow(page, 'Rolled oats')).toContainText('46 kcal')
})
