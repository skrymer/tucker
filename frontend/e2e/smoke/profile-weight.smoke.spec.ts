import { test, expect } from '@nuxt/test-utils/playwright'

// F4 slice 3 smoke: the full UI → API → DB path for backfilling a past weight
// from the /profile Weight log. No mocks.
//
// We use a fixed, far-past date that real usage is unlikely to occupy, and
// delete any leftover record for it before asserting and again on teardown so
// the docker volume starts and ends clean.
const backfillDate = '2015-01-01'
const formattedDate = new Date(2015, 0, 1).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const weightKg = 73.7

test('user backfills a past weight on /profile and it appears in the list', async ({
  page,
  goto,
  request,
}) => {
  await deleteWeightOn(request, backfillDate)

  await goto('/profile', { waitUntil: 'hydration' })

  const weightLog = page.getByRole('region', { name: /weight log/i })
  await weightLog.getByRole('button', { name: /add weight/i }).click()

  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await expect(sheet).toBeVisible()
  await sheet.getByLabel(/date/i).fill(backfillDate)
  await sheet.getByLabel(/weight \(kg\)/i).fill(String(weightKg))
  await sheet.getByRole('button', { name: /save weight/i }).click()

  await expect(sheet).toBeHidden()

  // The backfilled reading shows up in the list with its date and value.
  const row = weightLog.getByRole('listitem').filter({ hasText: formattedDate })
  await expect(row).toBeVisible()
  await expect(row).toContainText(`${weightKg.toFixed(1)} kg`)

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
