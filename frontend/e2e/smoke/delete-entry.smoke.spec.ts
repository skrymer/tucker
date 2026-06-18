import { test, expect } from './support/smoke-test'
import { todayIso } from '../support/date'

// Issue #113 smoke: delete a mislogged Entry from Today through its row's trash
// icon + the confirm, against the real backend. Seeds two Estimated entries on
// today, deletes one (the other and the re-derived running total remain), then
// deletes the last (the entries card collapses entirely). With no budget yet,
// DaySummary's plain "X kcal, Y g protein" card shows the running total, so the
// re-derivation is observable. The per-test reset wipes the seed — no cleanup.
const API = 'http://localhost:8080/api'

test('user deletes a mislogged entry from Today and the day re-derives', async ({
  page,
  goto,
  request,
}) => {
  const today = todayIso()
  const stamp = Date.now()
  const keep = `keep ${stamp}`
  const remove = `remove ${stamp}`

  for (const [label, calories, protein] of [
    [keep, 200, 10],
    [remove, 612, 30],
  ] as const) {
    const seeded = await request.post(`${API}/entries/estimated`, {
      data: { date: today, label, calories, protein },
    })
    expect(seeded.ok()).toBe(true)
  }

  await goto('/', { waitUntil: 'hydration' })

  // Both entries are on the day, and the totals card sums them.
  await expect(page.getByText(`${remove} — 612 kcal`)).toBeVisible()
  await expect(page.getByText('812 kcal, 40 g protein')).toBeVisible()

  // Delete the mislogged one through its row's trash icon + the confirm.
  await page
    .getByRole('button', { name: `Delete ${remove} — 612 kcal` })
    .click()
  const confirm = page.getByRole('dialog', { name: /delete this entry/i })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: /^delete$/i }).click()

  // The row vanishes, the kept entry stays, and the total re-derives without it.
  await expect(confirm).toBeHidden()
  await expect(page.getByText(`${remove} — 612 kcal`)).toBeHidden()
  await expect(page.getByText(`${keep} — 200 kcal`)).toBeVisible()
  await expect(page.getByText('200 kcal, 10 g protein')).toBeVisible()

  // Deleting the last entry collapses the entries card entirely.
  await page.getByRole('button', { name: `Delete ${keep} — 200 kcal` }).click()
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: /^delete$/i }).click()

  await expect(confirm).toBeHidden()
  await expect(
    page.getByRole('heading', { name: "Today's entries" }),
  ).toBeHidden()
  await expect(page.getByText('0 kcal, 0 g protein')).toBeVisible()
})
