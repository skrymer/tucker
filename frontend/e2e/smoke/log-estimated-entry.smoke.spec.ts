import { test, expect } from './support/smoke-test'

// Slice 1 smoke: the full UI → API → DB path for logging an Estimated
// entry against the real backend. No mocks.
//
// The Today page lists entries by name (or label) — after submit, the
// entry appears in the dashboard. Cleanup deletes the entry via the API so
// the docker volume's state survives unchanged between runs.
test('user logs an Estimated entry from Today and the dashboard updates', async ({
  page,
  goto,
  request,
}) => {
  // Unique label so the assertion + cleanup is robust to other data in
  // the persisted dev volume.
  const label = `smoke ${Date.now()}`
  const calories = 612

  await goto('/', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: /log entry/i }).click()
  const sheet = page.getByRole('dialog', { name: /log entry/i })
  await expect(sheet).toBeVisible()

  // Estimated is the default tab — fill and submit.
  await sheet.getByLabel('Label').fill(label)
  await sheet.getByLabel('Calories').fill(String(calories))
  await sheet.getByRole('button', { name: /log estimated entry/i }).click()

  // The sheet closes and the entry surfaces in the Today entries list.
  await expect(sheet).toBeHidden()
  await expect(page.getByText(`${label} — ${calories} kcal`)).toBeVisible()

  // Cleanup: find today's entries through the API, delete the one we made.
  const today = new Date().toLocaleDateString('en-CA')
  const list = await request.get('http://localhost:8080/api/entries', {
    params: { date: today },
  })
  expect(list.ok()).toBe(true)
  const entries = (await list.json()) as Array<{
    id: number
    label?: string
  }>
  const created = entries.find((e) => e.label === label)
  expect(
    created,
    'created entry should be returned by GET /api/entries',
  ).toBeDefined()
  const del = await request.delete(
    `http://localhost:8080/api/entries/${created!.id}`,
  )
  expect(del.status()).toBe(204)
})
