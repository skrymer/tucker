import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import { toast } from '../support/toast'

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

  // The sheet closes and the toast names the entry that just landed, so a
  // mis-typed label is caught without hunting for the row (ADR 0005 keeps this
  // one success toast precisely because the delta may be scrolled off-screen).
  await expect(sheet).toBeHidden()
  // Exact on both surfaces: protein was left blank, so the name ends at the
  // calories — never `· 0 g protein` (CONTEXT.md, "Estimated Entry"). A
  // substring match would pass the very output this guards, since the expected
  // string is a prefix of it.
  await expect(
    toast(page, 'Entry logged').getByText(`${label} — ${calories} kcal`, {
      exact: true,
    }),
  ).toBeVisible()

  // The entry surfaces in the Today entries list. Scoped to the page, because
  // the toast says the same words — `formatEntryName` is deliberately shared —
  // and an unscoped match would be ambiguous while the toast is up.
  await expect(
    page
      .getByRole('main')
      .getByText(`${label} — ${calories} kcal`, { exact: true }),
  ).toBeVisible()

  // Cleanup: find today's entries through the API, delete the one we made.
  const today = todayIso()
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
