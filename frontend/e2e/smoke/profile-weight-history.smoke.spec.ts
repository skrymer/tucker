import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays, formatDmy } from '../support/date'

// Issue #105: the /profile Weight section shows only the current value; the full
// chronological log lives on its own /profile/weight history page reached via
// "View history". Seed several readings, confirm /profile shows just the latest
// (no inline list), follow the link to the history page and assert the full
// list, then return. Full UI → API → DB path, no mocks.
const API = 'http://localhost:8080/api'

// Seven consecutive days ending today, trending down so the latest reading is a
// loss vs the previous one.
const readings = [
  { date: isoShiftDays(todayIso(), -6), weightKg: 85.0 },
  { date: isoShiftDays(todayIso(), -5), weightKg: 84.9 },
  { date: isoShiftDays(todayIso(), -4), weightKg: 84.8 },
  { date: isoShiftDays(todayIso(), -3), weightKg: 84.7 },
  { date: isoShiftDays(todayIso(), -2), weightKg: 84.6 },
  { date: isoShiftDays(todayIso(), -1), weightKg: 84.5 },
  { date: todayIso(), weightKg: 84.0 },
]
const oldestDate = formatDmy(readings[0]!.date)

test('the Weight section shows the current value and links to the full history', async ({
  page,
  goto,
  request,
}) => {
  // The Weight section unlocks only once a profile exists.
  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  for (const r of readings) {
    const res = await request.post(`${API}/weight`, { data: r })
    expect(res.ok()).toBe(true)
  }

  await goto('/profile', { waitUntil: 'hydration' })

  const weight = page.getByRole('region', { name: /^weight$/i })

  // At a glance: the latest reading as a headline with its neutral delta vs the
  // previous reading. No inline log — the oldest reading is nowhere on /profile.
  await expect(weight.getByText('Latest')).toBeVisible()
  await expect(weight.getByText('84.0 kg')).toBeVisible()
  await expect(weight.getByLabel(/down 0\.5 kg/i)).toBeVisible()
  await expect(weight.getByRole('listitem')).toHaveCount(0)
  await expect(page.getByText(oldestDate)).toBeHidden()

  // Follow the link to the dedicated history page: the full list, newest first.
  await weight.getByRole('link', { name: /view history/i }).click()
  await expect(page).toHaveURL(/\/profile\/weight$/)
  await expect(
    page.getByRole('heading', { level: 1, name: /weight history/i }),
  ).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(7)
  await expect(page.getByText(oldestDate)).toBeVisible()

  // It's Profile detail, so the Profile nav tab stays active on this route.
  await expect(
    page.getByRole('link', { name: 'Profile', exact: true }),
  ).toHaveAttribute('aria-current', 'page')

  // The back affordance returns to Profile, where the summary still shows.
  await page.getByRole('link', { name: /back to profile/i }).click()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(weight.getByText('Latest')).toBeVisible()
})
