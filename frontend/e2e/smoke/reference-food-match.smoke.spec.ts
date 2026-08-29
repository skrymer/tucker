import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F15 slice 1 smoke: matching a Food to a Reference Food end-to-end against the
// real backend — the AFCD corpus Flyway seeded, the FTS5 search over it, and the
// borrow the match records (ADR 0027).
// No teardown: the auto `freshDatabase` fixture resets the DB before every smoke
// (issue #70), so seeding is all a test owes.
const API = 'http://localhost:8080/api'

test('a matched Food moves the coverage figure and names its borrow in the catalog', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()

  // Named as a shopper would, not as FSANZ does: `tasty` is Australian retail
  // vernacular the corpus has never heard of, so this only finds a cheddar
  // through the seeded synonym rewrite.
  const created = await request.post(`${API}/foods`, {
    data: {
      name: 'Tasty cheese',
      proteinPer100g: 25,
      carbsPer100g: 0,
      fatPer100g: 33,
    },
  })
  expect(created.status()).toBe(201)
  const cheese = (await created.json()) as { id: number }

  // The only Entry in the window, so matching it takes coverage from 0% to 100%.
  const logged = await request.post(`${API}/entries/weighed`, {
    data: { date: today, foodId: cheese.id, grams: 100 },
  })
  expect(logged.status()).toBe(201)

  await goto('/review', { waitUntil: 'hydration' })

  const section = page.getByRole('region', { name: 'Vitamins and minerals' })
  await expect(
    section.getByText(
      "0% of the last 7 days' calories came from food Tucker can read vitamins and minerals for.",
    ),
  ).toBeVisible()

  await section.getByRole('button', { name: '1 food to match' }).click()
  await section.getByRole('button', { name: 'Match Tasty cheese' }).click()

  // The picker opens already searching for the Food's own name, and the real
  // corpus answers with a cheddar — head-noun boosting plus the `tasty` rewrite.
  // AFCD holds several cheddars, so this takes the top-ranked one — which is the
  // one carrying the Suggested badge asserted below.
  const suggested = page
    .getByRole('button', { name: /Cheese, cheddar/ })
    .first()
  await expect(suggested).toBeVisible()
  await expect(suggested).toContainText('Suggested')
  await suggested.click()

  await expect(
    section.getByText(
      "100% of the last 7 days' calories came from food Tucker can read vitamins and minerals for.",
    ),
  ).toBeVisible()
  await expect(section.getByText('Nothing left to match.')).toBeVisible()

  // And the catalog names what it borrows from, rather than ticking it.
  await goto('/foods', { waitUntil: 'hydration' })
  const subline = page.getByText(/Vitamins and minerals from Cheese, cheddar/)
  await expect(subline).toBeVisible()

  // A match is reversible, and taking it back is as easy as making it.
  await page
    .getByRole('button', {
      name: 'Change what Tasty cheese borrows vitamins and minerals from',
    })
    .click()
  await page.getByRole('button', { name: 'Unmatch' }).click()

  await expect(subline).toBeHidden()

  await goto('/review', { waitUntil: 'hydration' })
  await expect(
    section.getByRole('button', { name: '1 food to match' }),
  ).toBeVisible()
})
