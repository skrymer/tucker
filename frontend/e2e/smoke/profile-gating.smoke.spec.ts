import { test, expect } from '@nuxt/test-utils/playwright'

// F4 slice 6 smoke: progressive disclosure on /profile against the real backend.
// No mocks.
//
// Gating keys off two irreversible-ish signals: a Profile (PUT-upsert, no
// DELETE) and at least one WeightMeasurement. Because the profile can't be
// deleted, the "no profile → everything gated" state only exists on a fresh
// volume — so, like the setup-banner smoke, we branch on whether a profile
// already exists:
//   • Fresh DB (no profile): walk the full unlock — only Profile enabled,
//     submit it to unlock Weight, log a weight to unlock Goal. We backfill the
//     weight on a unique far-past date and delete it on teardown; the profile
//     is left behind (no DELETE), exactly as a real first run ends.
//   • Already set up: assert the contract for the current state — Profile
//     saved ⇒ Weight enabled, and Goal enabled iff a weight exists. Net-zero.
const API = 'http://localhost:8080/api'

// A far-past date real usage is unlikely to occupy, so cleanup is precise.
const backfillDate = '2014-03-03'
const backfillKg = 70.7

test('progressive disclosure unlocks Weight after Profile and Goal after a weight', async ({
  page,
  goto,
  request,
}) => {
  const profileExists = (await request.get(`${API}/profile`)).ok()

  if (!profileExists) {
    await goto('/profile', { waitUntil: 'hydration' })

    const weight = page.getByRole('region', { name: /weight log/i })
    const goal = page.getByRole('region', { name: /^goal$/i })

    // Fresh: only the Profile section is interactive.
    await expect(weight.getByText(/set your profile first/i)).toBeVisible()
    await expect(
      weight.getByRole('button', { name: /add weight/i }),
    ).toHaveCount(0)
    await expect(goal.getByText(/log your weight first/i)).toBeVisible()

    // Save the Profile → Weight unlocks without a reload, Goal stays gated.
    await page.getByRole('radio', { name: /^male$/i }).click()
    await page.getByLabel(/birth date/i).fill('1990-06-15')
    await page.getByLabel(/height/i).fill('180')
    await page.getByRole('button', { name: /save profile/i }).click()

    await expect(
      weight.getByRole('button', { name: /add weight/i }),
    ).toBeVisible()
    await expect(weight.getByText(/set your profile first/i)).toHaveCount(0)
    await expect(goal.getByText(/log your weight first/i)).toBeVisible()

    // Log a weight → Goal unlocks without a reload.
    await weight.getByRole('button', { name: /add weight/i }).click()
    const sheet = page.getByRole('dialog', { name: /log weight/i })
    await sheet.getByLabel(/date/i).fill(backfillDate)
    await sheet.getByLabel(/weight \(kg\)/i).fill(String(backfillKg))
    await sheet.getByRole('button', { name: /save weight/i }).click()
    await expect(sheet).toBeHidden()

    await expect(goal.getByLabel(/target weight/i)).toBeVisible()
    await expect(goal.getByText(/log your weight first/i)).toHaveCount(0)

    await deleteWeightOn(request, backfillDate)
    return
  }

  // Already set up: assert the stable half of the contract — a saved Profile
  // unlocks Weight. We deliberately don't assert the Goal's gated/unlocked
  // state here: weight existence is the gating signal, and the two browser
  // projects share one backend, so the other project may be concurrently
  // backfilling and deleting its weight. The full weight→Goal unlock is
  // covered deterministically by the fresh branch above.
  await goto('/profile', { waitUntil: 'hydration' })

  const weight = page.getByRole('region', { name: /weight log/i })

  await expect(
    weight.getByRole('button', { name: /add weight/i }),
  ).toBeVisible()
  await expect(weight.getByText(/set your profile first/i)).toHaveCount(0)
})

async function deleteWeightOn(
  request: Parameters<Parameters<typeof test>[1]>[0]['request'],
  date: string,
) {
  const list = await request.get(`${API}/weight`)
  expect(list.ok()).toBe(true)
  const records = (await list.json()) as Array<{
    id: number
    measuredOn: string
  }>
  for (const r of records.filter((r) => r.measuredOn === date)) {
    const del = await request.delete(`${API}/weight/${r.id}`)
    expect(del.status()).toBe(204)
  }
}
