import { expect, test } from './support/test'
import { mockProfile, mockWeightList } from './support/mock-api'

test('a backfilled weight becomes the current weight and is reachable in history', async ({
  page,
  goto,
}) => {
  await mockProfile(page, {
    sex: 'MALE',
    birthDate: '1990-06-15',
    heightCm: 180,
  })
  await mockWeightList(page, [])

  await goto('/profile', { waitUntil: 'hydration' })

  const weight = page.getByRole('region', { name: /^weight$/i })
  await expect(weight.getByText(/no weight logged yet/i)).toBeVisible()

  await weight.getByRole('button', { name: /add weight/i }).click()

  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await sheet.getByLabel(/date/i).fill('2024-03-15')
  await sheet.getByLabel(/weight \(kg\)/i).fill('84.2')
  await sheet.getByRole('button', { name: /save weight/i }).click()

  await expect(sheet).toBeHidden()

  // The section now shows the latest value at a glance — no inline log — with a
  // link out to the full history. Closed-world snapshot of its resting state.
  // One baseline per project (the sheet is a drawer on phone, a modal on
  // desktop, but the resting section is identical).
  await expect(weight.getByText('84.2 kg')).toBeVisible()
  await expect(weight.getByRole('listitem')).toHaveCount(0)
  await expect(weight).toMatchAriaSnapshot()

  // The backfilled reading lives on the dedicated history page.
  await weight.getByRole('link', { name: /view history/i }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: /weight history/i }),
  ).toBeVisible()
  const row = page.getByRole('listitem').filter({ hasText: '15 Mar 2024' })
  await expect(row).toContainText('84.2 kg')
})
