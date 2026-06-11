import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'

// ADR 0016 smoke: a Goal's start weight is the live Trend Weight at creation,
// derived by the backend — not the raw scale reading. We log two readings a day
// apart so the smoothed trend (107.1) lags the latest raw reading (108.0), set the
// Goal through the UI, and prove the form, the Goal card, and Goal progress all use
// the trend (107.1) — so a fresh Goal reads 0%, never the raw-anchored "already
// ~2.3% done" bug (#114). The auto fixture resets the DB, so no cleanup is needed.
const API = 'http://localhost:8080/api'
type Request = Parameters<Parameters<typeof test>[1]>[0]['request']

test('a freshly set Goal anchors its start on the trend and reads 0%', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const yesterday = isoShiftDays(today, -1)

  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  // Two readings a day apart: EWMA (α = 0.10) lags the latest, so the trend is
  // 0.1·108 + 0.9·107 = 107.1, while the raw latest reading is 108.0.
  await postWeight(request, yesterday, 107.0, today)
  await postWeight(request, today, 108.0, today)

  await goto('/profile', { waitUntil: 'hydration' })
  const goal = page.getByRole('region', { name: /^goal$/i })

  // Open the creation form. It shows the starting *trend* (107.1 kg), never the
  // raw latest reading (108.0 kg) — the heart of ADR 0016.
  await goal.getByRole('button', { name: /start a goal/i }).click()
  await expect(goal.getByText(/107\.1 kg/)).toBeVisible()
  await expect(goal.getByText(/108\.0 kg/)).toHaveCount(0)

  await goal.getByLabel(/target weight/i).fill('88')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The new Goal card shows the start anchored on the trend (107.1 kg).
  await expect(
    goal.getByRole('button', { name: /set a new goal/i }),
  ).toBeVisible()
  await expect(goal.getByText('107.1 kg')).toBeVisible()

  // On /review the Goal-progress hero reads 0% — start == now == the trend, not
  // the raw-anchored ~2.3% the bug produced.
  await goto('/review', { waitUntil: 'hydration' })
  const hero = page
    .locator('[data-slot="root"]')
    .filter({ hasText: 'Goal progress' })
  await expect(hero).toBeVisible()
  await expect(hero.getByText('0%')).toBeVisible()
  await expect(hero.getByText('108.0 kg')).toHaveCount(0)
})

async function postWeight(
  request: Request,
  date: string,
  weightKg: number,
  clientToday: string,
) {
  const res = await request.post(`${API}/weight`, {
    data: { date, weightKg, clientToday },
  })
  expect(res.ok()).toBe(true)
}
