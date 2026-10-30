import { test, expect } from './support/smoke-test'
import { create, expectCreated, expectStatus } from './support/seeding'
import { isoShiftDays, todayIso } from '../support/date'

// F22 slice 6 smoke (#551): the fibre a Food states reaches Micronutrient Intake
// end to end, matched or not (CONTEXT.md, Micronutrient Intake). No teardown: the
// auto `freshDatabase` fixture resets the DB before every smoke (issue #70).
const API = 'http://localhost:8080/api'

test('an unmatched wrap stating its fibre puts that fibre in the window', async ({
  page,
  goto,
  request,
}) => {
  // Born 1990, so the 31–50 band: a man's fibre reference is 30 g a day.
  await expectStatus(
    request.put(`${API}/profile`, {
      data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
    }),
    200,
  )

  // The protein wrap's label, fibre and all — and never matched to a Reference Food.
  const wrap = await create(request, '/foods', {
    tagIds: [],
    name: 'Protein wrap',
    proteinPer100g: 19.4,
    carbsPer100g: 12.8,
    fatPer100g: 9.3,
    fibrePer100g: 16.8,
  })

  // 200 g of wraps on each of the seven days: 235.2 g of fibre, 33.6 g a day —
  // past the 30 g line, which is what it takes for the card to draw a figure. A
  // lower bound is rounded down, so it reads 33 g.
  const today = todayIso()
  await Promise.all(
    Array.from({ length: 7 }, (_, back) =>
      expectCreated(
        request.post(`${API}/entries/weighed`, {
          data: { date: isoShiftDays(today, -back), foodId: wrap, grams: 200 },
        }),
      ),
    ),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const section = page.getByRole('region', { name: 'Vitamins and minerals' })

  const fibre = section.getByRole('group', { name: 'Dietary fibre' })
  await expect(fibre).toContainText('≥ 33 g')
  await expect(fibre).toContainText('Reference 30 g')

  // Stating fibre is not a match: nothing else of the wrap is read, and it is
  // still waiting in the queue.
  await expect(section.getByText(/Not enough matched to say/)).toContainText(
    'Iron',
  )
  await expect(
    section.getByRole('button', { name: '1 food is not matched yet' }),
  ).toBeVisible()
})
