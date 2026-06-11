import { test, expect } from './support/smoke-test'
import { formatDmy } from '../support/date'

// Issue #105: backfilling a past weight on /profile writes through the real
// backend and updates the at-a-glance current-weight summary (the inline log
// moved to the /profile/weight history page). No mocks.
//
// We use a fixed, far-past date that real usage is unlikely to occupy, and
// delete any leftover record for it before asserting and again on teardown so
// the docker volume starts and ends clean.
const backfillDate = '2015-01-01'
const formattedDate = formatDmy(backfillDate)
const weightKg = 73.7

test('user backfills a past weight on /profile and it shows as the current weight', async ({
  page,
  goto,
  request,
}) => {
  // The Weight section unlocks only once a profile exists; each smoke runs against
  // a reset DB, so seed one (idempotent upsert) before opening /profile.
  await request.put('http://localhost:8080/api/profile', {
    data: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
  })
  await deleteWeightOn(request, backfillDate)

  await goto('/profile', { waitUntil: 'hydration' })

  const weight = page.getByRole('region', { name: /^weight$/i })
  await weight.getByRole('button', { name: /add weight/i }).click()

  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel(/date/i).fill(backfillDate)
  await sheet.getByLabel(/weight \(kg\)/i).fill(String(weightKg))
  await sheet.getByRole('button', { name: /save weight/i }).click()

  await expect(sheet).toBeHidden()

  // The reading round-trips and surfaces as the current weight: the section shows
  // the value and date at a glance, with no inline list (history is its own page).
  await expect(weight.getByText('Latest')).toBeVisible()
  await expect(weight.getByText(`${weightKg.toFixed(1)} kg`)).toBeVisible()
  await expect(weight.getByText(formattedDate)).toBeVisible()
  await expect(weight.getByRole('listitem')).toHaveCount(0)

  await deleteWeightOn(request, backfillDate)
})

async function deleteWeightOn(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  date: string,
) {
  const list = await request.get('http://localhost:8080/api/weight')
  expect(list.ok()).toBe(true)
  const records = (await list.json()) as Array<{
    id: number
    measuredOn: string
  }>
  for (const r of records.filter((r) => r.measuredOn === date)) {
    const del = await request.delete(`http://localhost:8080/api/weight/${r.id}`)
    expect(del.status()).toBe(204)
  }
}
