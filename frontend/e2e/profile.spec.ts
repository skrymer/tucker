import { expect, test } from './support/network'
import {
  baselineProfile,
  profileOf,
  savedProfile,
} from '../test/mocks/handlers/profile'
import { pickDate } from './support/date-field'
import { formatDmy, localTodayIso } from './support/date'

test('the Profile page prefills the form from the saved profile', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    profileOf({
      ...baselineProfile,
      sex: 'FEMALE',
      birthDate: '1985-03-22',
      heightCm: 168,
    }),
  )

  await goto('/profile', { waitUntil: 'hydration' })

  await expect(page.getByRole('radio', { name: /^female$/i })).toBeChecked()
  await expect(page.getByLabel(/birth date/i)).toHaveText(
    formatDmy('1985-03-22'),
  )
  await expect(page.getByLabel(/height/i)).toHaveValue('168')
})

test('the Profile page renders an empty form when no profile exists yet', async ({
  page,
  goto,
  network,
}) => {
  network.use(...savedProfile(null).handlers)

  await goto('/profile', { waitUntil: 'hydration' })

  await expect(page.getByRole('radio', { name: /^male$/i })).not.toBeChecked()
  await expect(page.getByRole('radio', { name: /^female$/i })).not.toBeChecked()
  await expect(page.getByLabel(/birth date/i)).toHaveText(/choose a date/i)
  await expect(page.getByLabel(/height/i)).toHaveValue('')
})

test('the Profile page saves the profile and shows it again on the next visit', async ({
  page,
  goto,
  network,
}) => {
  network.use(...savedProfile(null, { today: localTodayIso() }).handlers)

  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByRole('radio', { name: /^male$/i }).click()
  await pickDate(page.getByLabel(/birth date/i), '1990-06-15')
  await page.getByLabel(/height/i).fill('180')
  await page.getByRole('button', { name: /save profile/i }).click()

  // A Profile unlocks the Weight section: the save has landed.
  const weight = page.getByRole('region', { name: /^weight$/i })
  await expect(
    weight.getByRole('button', { name: /add weight/i }),
  ).toBeVisible()

  await page.reload()

  await expect(page.getByRole('radio', { name: /^male$/i })).toBeChecked()
  await expect(page.getByLabel(/birth date/i)).toHaveText(
    formatDmy('1990-06-15'),
  )
  await expect(page.getByLabel(/height/i)).toHaveValue('180')
})
