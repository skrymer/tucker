import { test, expect } from '@nuxt/test-utils/playwright'

// F4 Slice 1 smoke: the Profile section round-trips through the real
// backend. Snapshot any existing profile via the API, fill the form,
// submit, reload the page, assert the saved values render, then restore
// the original profile so the docker volume stays clean across runs.
//
// The API has no DELETE on /profile (it's an upsert via PUT), so on the
// very first run — when no profile exists yet — the test's profile is
// left in place. Every subsequent run is net-zero.
test('user saves a profile and the saved values persist across a reload', async ({
  page,
  goto,
  request,
}) => {
  const PROFILE_URL = 'http://localhost:8080/api/profile'

  // Snapshot any existing profile so we can restore it after.
  let previousProfile: unknown = null
  const before = await request.get(PROFILE_URL)
  if (before.ok()) previousProfile = await before.json()

  // Unique values per run so we can detect them on the page.
  const heightCm = 150 + Math.floor(Math.random() * 50)
  const birthDate = '1990-06-15'

  try {
    await goto('/profile', { waitUntil: 'hydration' })

    await page.getByRole('radio', { name: /^male$/i }).click()
    await page.getByLabel(/birth date/i).fill(birthDate)
    await page.getByLabel(/height/i).fill(String(heightCm))
    await page.getByRole('button', { name: /save profile/i }).click()

    // Wait for the save to round-trip: the backend GET reflects the
    // new height before we reload.
    await expect
      .poll(async () => {
        const res = await request.get(PROFILE_URL)
        if (!res.ok()) return null
        return ((await res.json()) as { heightCm: number }).heightCm
      })
      .toBe(heightCm)

    // Reload to prove the value is persisted server-side, not just in
    // local component state.
    await page.reload({ waitUntil: 'load' })

    await expect(page.getByRole('radio', { name: /^male$/i })).toBeChecked()
    await expect(page.getByLabel(/birth date/i)).toHaveValue(birthDate)
    await expect(page.getByLabel(/height/i)).toHaveValue(String(heightCm))

    // The API itself agrees.
    const after = await request.get(PROFILE_URL)
    expect(after.status()).toBe(200)
    const saved = (await after.json()) as {
      sex: string
      birthDate: string
      heightCm: number
    }
    expect(saved.sex).toBe('MALE')
    expect(saved.birthDate).toBe(birthDate)
    expect(saved.heightCm).toBe(heightCm)
  } finally {
    if (previousProfile) {
      await request.put(PROFILE_URL, { data: previousProfile })
    }
  }
})
