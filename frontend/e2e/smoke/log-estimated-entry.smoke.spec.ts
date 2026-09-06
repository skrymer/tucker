import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'
import { toast } from '../support/toast'

// The full UI → API → DB path for logging an Estimated entry against the real
// backend, from the Log destination — where an estimate is a peer of picking a
// Food rather than a tab in a sheet (ADR 0028). No mocks.
//
// The Entry lands on Today, which is never the page that logged it, so the
// toast is the only thing that names it at the point of focus (ADR 0005) and
// the API read is what says it reached the database. Cleanup deletes it so the
// docker volume's state survives unchanged between runs.
test('user logs an Estimated entry from Log and the toast names it', async ({
  page,
  goto,
  request,
}) => {
  // Unique label so the assertion + cleanup is robust to other data in
  // the persisted dev volume.
  const label = `smoke ${Date.now()}`
  const calories = 612

  await goto('/log', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: /log an estimate instead/i }).click()
  const sheet = page.getByRole('dialog', { name: /log an estimate/i })
  await expect(sheet).toBeVisible()

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

  // Cleanup, and the assertion that it reached the database: find today's
  // entries through the API, check ours is among them, delete it.
  const today = todayIso()
  const list = await request.get('http://localhost:8080/api/entries', {
    params: { date: today },
  })
  expect(list.ok()).toBe(true)
  const entries = (await list.json()) as Array<{
    id: number
    label?: string
    calories?: number
  }>
  const created = entries.find((e) => e.label === label)
  expect(
    created,
    'created entry should be returned by GET /api/entries',
  ).toBeDefined()
  expect(created!.calories).toBe(calories)
  const del = await request.delete(
    `http://localhost:8080/api/entries/${created!.id}`,
  )
  expect(del.status()).toBe(204)
})
