import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays, formatDmy } from '../support/date'

// Issue #93: the /profile Weight log must not bury the actionable sections.
// With many readings it shows a compact summary (latest + delta) and only the
// five most recent rows, folding the rest behind a "Show all" expander. Full
// UI → API → DB path, no mocks.
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

test('the weight log summarises and caps a long history on /profile', async ({
  page,
  goto,
  request,
}) => {
  // The Weight log unlocks only once a profile exists.
  await request.put(`${API}/profile`, {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  for (const r of readings) {
    const res = await request.post(`${API}/weight`, { data: r })
    expect(res.ok()).toBe(true)
  }

  await goto('/profile', { waitUntil: 'hydration' })

  const weightLog = page.getByRole('region', { name: /weight log/i })

  // Compact summary: the latest reading as a headline, with its delta vs the
  // previous reading (down is good — Tucker is a fat-loss app).
  await expect(weightLog.getByText('Latest')).toBeVisible()
  await expect(weightLog.getByLabel(/down 0\.5 kg/i)).toBeVisible()

  // Only the five most recent readings show before expanding.
  await expect(weightLog.getByRole('listitem')).toHaveCount(5)
  await expect(weightLog.getByText(oldestDate)).toBeHidden()

  // Reveal the rest.
  await weightLog.getByRole('button', { name: /show all 7 readings/i }).click()
  await expect(weightLog.getByRole('listitem')).toHaveCount(7)
  await expect(weightLog.getByText(oldestDate)).toBeVisible()
})
