import { test, expect } from './support/smoke-test'

// F4 slice 2 smoke: the full UI → API → DB path for logging today's weight
// from the dashboard tile. No mocks.
//
// Pre-conditions: the docker volume must have no weight measurement for
// today. We enforce that here by deleting any existing today-dated record
// before the assertions run, then again on teardown so the next run starts
// clean.
test("user logs today's weight from the tile and the value renders", async ({
  page,
  goto,
  request,
}) => {
  const today = new Date().toLocaleDateString('en-CA')
  const weightKg = 84.2

  // Clean slate: drop any leftover measurement for today.
  await deleteWeightOn(request, today)

  await goto('/', { waitUntil: 'hydration' })

  // Tile starts in the not-logged state.
  await expect(
    page.getByRole('button', { name: /^log weight$/i }),
  ).toBeVisible()

  await page.getByRole('button', { name: /^log weight$/i }).click()
  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await expect(sheet).toBeVisible()

  await sheet.getByLabel(/weight \(kg\)/i).fill(String(weightKg))
  await sheet.getByRole('button', { name: /save weight/i }).click()

  // Tile flips into logged-today state with the value.
  await expect(sheet).toBeHidden()
  await expect(page.getByText(`${weightKg.toFixed(1)} kg`)).toBeVisible()
  await expect(
    page.getByRole('button', { name: /edit today's weight/i }),
  ).toBeVisible()

  // Cleanup: delete the measurement we created so the next run is fresh.
  await deleteWeightOn(request, today)
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
