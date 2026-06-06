import { expect, test } from './support/test'
import { mockProfile, mockWeightList } from './support/mock-api'

test('a backfilled weight appears in the Weight log list', async ({
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

  const weightLog = page.getByRole('region', { name: /weight log/i })
  await expect(weightLog.getByText(/no weight logged yet/i)).toBeVisible()

  await weightLog.getByRole('button', { name: /add weight/i }).click()

  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await sheet.getByLabel(/date/i).fill('2024-03-15')
  await sheet.getByLabel(/weight \(kg\)/i).fill('84.2')
  await sheet.getByRole('button', { name: /save weight/i }).click()

  await expect(sheet).toBeHidden()

  // Closed-world check of the section's final state: the backfilled reading is
  // listed and the empty state is gone. One baseline per project (the sheet is
  // a drawer on phone, a modal on desktop, but the resting section is identical).
  await expect(weightLog).toMatchAriaSnapshot()
})
