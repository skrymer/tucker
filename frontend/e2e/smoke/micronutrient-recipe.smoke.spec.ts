import type { APIResponse } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { expectStatus, expectCreated } from './support/seeding'
import { todayIso } from '../support/date'

// F15 slice 3 smoke (#280): a Recipe contributes through whichever of its
// ingredients are matched, end to end against the real backend. The queue holds
// the *ingredients* — one of which was never logged on its own — while the dish
// itself is never offered, because a Recipe is never matched (ADR 0027).
// No teardown: the auto `freshDatabase` fixture resets the DB before every
// smoke (issue #70), so seeding is all a test owes.
const API = 'http://localhost:8080/api'

test('a Recipe rolls up from the ingredients matched through the queue', async ({
  page,
  goto,
  request,
}) => {
  // A body to read the figures against — born 1990, so the 31–50 band, where
  // calcium is 1,000 mg a day.
  await expectStatus(
    request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    }),
    200,
  )

  // Protein alone, so 100 g is 100 kcal in both and the shares below are exact.
  // The macros are the Food's own and stay its own; only the vitamins and
  // minerals are borrowed, and they come from the AFCD entry the match names.
  const createdId = async (pending: Promise<APIResponse>) => {
    await expectCreated(pending)
    return ((await (await pending).json()) as { id: number }).id
  }
  const macros = { proteinPer100g: 25, carbsPer100g: 0, fatPer100g: 0 }
  const cheese = await createdId(
    request.post(`${API}/foods`, { data: { name: 'Tasty cheese', ...macros } }),
  )
  const rice = await createdId(
    request.post(`${API}/foods`, { data: { name: 'Jasmine rice', ...macros } }),
  )

  const bake = await createdId(
    request.post(`${API}/recipes`, {
      data: {
        name: 'Cheesy bake',
        cookedWeightG: 2000,
        ingredients: [
          { foodId: cheese, grams: 1400 },
          { foodId: rice, grams: 600 },
        ],
      },
    }),
  )

  // The whole batch, and the *only* thing logged — so neither ingredient has an
  // Entry of its own, and the queue can only reach them through the dish.
  await expectCreated(
    request.post(`${API}/entries/weighed`, {
      data: { date: todayIso(), foodId: bake, grams: 2000 },
    }),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const section = page.getByRole('region', { name: 'Vitamins and minerals' })

  // Anchored: a bare '0%' is a substring of the '70%' asserted below, so it would
  // pass even if the dish were already counted before a single tap.
  await expect(section).toContainText(/\b0% of the last 7 days/)
  await section
    .getByRole('button', { name: '2 foods are not matched yet' })
    .click()
  // Both ingredients are offered and the dish is not: a Recipe rolls up rather
  // than being matched, so queueing it would be a tap that cannot be taken.
  await expect(
    section.getByRole('button', { name: 'Match Tasty cheese' }),
  ).toBeVisible()
  await expect(
    section.getByRole('button', { name: 'Match Jasmine rice' }),
  ).toBeVisible()
  await expect(
    section.getByRole('button', { name: /Match Cheesy bake/ }),
  ).toHaveCount(0)

  await section.getByRole('button', { name: 'Match Tasty cheese' }).click()
  await page
    .getByRole('button', { name: /Cheese, cheddar, natural, regular fat/ })
    .click()

  // One tap on one ingredient of five parts cheese to three of rice: 1,400 of
  // the batch's 2,000 calories can now contribute, which is the partly-matched
  // Recipe counting fractionally rather than all-or-none (ADR 0027).
  await expect(section).toContainText('70% of the last 7 days')

  // And the nutrient moves with it — 1,400 g of AFCD's cheddar at 760 mg of
  // calcium per 100 g is 10,640 mg across the window, 1,520 mg a day.
  await expect(section.getByRole('group', { name: 'Calcium' })).toContainText(
    '≥ 1520 mg',
  )

  // Match the other ingredient and the dish is accounted for whole. An empty
  // queue now means every ingredient is matched, which is what lets the card
  // name estimated meals as the only rest a tap can never reach — the one
  // frontend change in this slice, and unreachable without this last tap.
  await section.getByRole('button', { name: 'Match Jasmine rice' }).click()
  await page
    .getByRole('button', { name: /^Rice, / })
    .first()
    .click()

  await expect(section).toContainText('100% of the last 7 days')
  await expect(section).toContainText('Nothing left to match.')
  await expect(section).not.toContainText('from recipes')
})
