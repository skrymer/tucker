import { expect, test } from './support/test'
import {
  baselineProfile,
  profileOf,
  savedProfile,
} from '../test/mocks/handlers/profile'
import { bodyAndPlan } from '../test/mocks/handlers/body'
import { pickDate } from './support/date-field'
import { formatDmy, localTodayIso } from './support/date'

test('the Profile page is four cards: Goal, Your details, Weekly-review reminder, Appearance', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...bodyAndPlan({
      profile: baselineProfile,
      readings: [{ id: 1, measuredOn: '2026-05-28', weightKg: 84.2 }],
      goals: [
        {
          id: 7,
          startedOn: '2026-05-01',
          startWeightKg: 90,
          targetWeightKg: 80,
          rateKgPerWeek: 0.5,
          active: true,
        },
      ],
    }),
  )

  await goto('/profile', { waitUntil: 'hydration' })
  await expect(
    page.getByRole('button', { name: 'Set a new goal' }),
  ).toBeVisible()

  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

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

  // A Profile unlocks the reminder settings: the save has landed.
  await expect(
    page.getByRole('heading', { name: /weekly-review reminder/i }),
  ).toBeVisible()

  await page.reload()

  await expect(page.getByRole('radio', { name: /^male$/i })).toBeChecked()
  await expect(page.getByLabel(/birth date/i)).toHaveText(
    formatDmy('1990-06-15'),
  )
  await expect(page.getByLabel(/height/i)).toHaveValue('180')
})
