import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// F15 slice 2 smoke (#279): the figures, end to end against the real backend —
// the AFCD profile a match borrows, the NHMRC Nutrient Reference Values V18
// seeds, and the three claims the two of them settle (ADR 0027).
// No teardown: the auto `freshDatabase` fixture resets the DB before every
// smoke (issue #70), so seeding is all a test owes.
const API = 'http://localhost:8080/api'

test('a match turns a week of food into figures, and says nothing it cannot', async ({
  page,
  goto,
  request,
}) => {
  // A body to read the figures against — a Reference Intake resolves from the
  // Profile's sex and age, so without one no nutrient earns a claim at all.
  // Born 1990, so this is the 31–50 band: calcium 1,000 mg, B12 2.4 µg.
  const profiled = await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  expect(profiled.ok()).toBe(true)

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

  // 1.4 kg over the week, which is what it takes to put AFCD's cheddar
  // (760 mg calcium per 100 g) past a 1,000 mg-a-day line as a *daily average*:
  // 10,640 mg ÷ 7. A week's total read against a daily figure would clear
  // almost every reference at once, which is why it is divided (CONTEXT.md).
  const logged = await request.post(`${API}/entries/weighed`, {
    data: { date: todayIso(), foodId: cheese.id, grams: 1400 },
  })
  expect(logged.status()).toBe(201)

  await goto('/review', { waitUntil: 'hydration' })
  const section = page.getByRole('region', { name: 'Vitamins and minerals' })

  // Nothing is matched, so no nutrient earns a claim and the card declines to
  // draw rather than listing all nineteen as unsayable — the matching flow is
  // what it offers instead (ADR 0027).
  await expect(
    section.getByText(/Match a few of the foods you eat most/),
  ).toBeVisible()
  await expect(section.getByRole('group')).toHaveCount(0)

  await section
    .getByRole('button', { name: '1 food is not matched yet' })
    .click()
  await section.getByRole('button', { name: 'Match Tasty cheese' }).click()
  await page
    .getByRole('button', { name: /Cheese, cheddar, natural, regular fat/ })
    .click()

  // Calcium was drawn nowhere a moment ago and is now a figure, stated as the
  // lower bound it is.
  const calcium = section.getByRole('group', { name: 'Calcium' })
  await expect(calcium).toContainText('≥ 1520 mg')
  await expect(calcium).toContainText('Reference 1000 mg')

  // Cheddar carries 1 mg of vitamin C per 100 g, so the week averages 2 mg
  // against a published 45. That is *not* a shortfall — the three-quarters of
  // this window that went unmatched could hold the rest — so it is a name with
  // no figure beside it, and nothing on the page calls it a deficiency.
  await expect(section.getByText(/Not enough matched to say/)).toContainText(
    'Vitamin C',
  )
  await expect(section.getByRole('group', { name: 'Vitamin C' })).toHaveCount(0)
  await expect(section).not.toContainText(/deficien/i)
  await expect(section).not.toContainText(/shortfall/i)

  // And the edition the figures were read off, which is a licence obligation
  // and the only way to see that a published line later moved.
  await expect(
    section.getByText(/NHMRC, 2006, sodium revised 2017/),
  ).toBeVisible()
})
