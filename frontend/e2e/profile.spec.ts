import { expect, test } from './support/test'
import { mockProfile, mockNoProfile } from './support/mock-api'

test('the Profile page prefills the form from the saved profile', async ({
  page,
  goto,
}) => {
  await mockProfile(page, {
    sex: 'FEMALE',
    birthDate: '1985-03-22',
    heightCm: 168,
  })

  await goto('/profile', { waitUntil: 'hydration' })

  await expect(page.getByRole('radio', { name: /^female$/i })).toBeChecked()
  await expect(page.getByLabel(/birth date/i)).toHaveValue('1985-03-22')
  await expect(page.getByLabel(/height/i)).toHaveValue('168')
})

test('the Profile page renders an empty form when no profile exists yet', async ({
  page,
  goto,
}) => {
  await mockNoProfile(page)

  await goto('/profile', { waitUntil: 'hydration' })

  await expect(page.getByRole('radio', { name: /^male$/i })).not.toBeChecked()
  await expect(page.getByRole('radio', { name: /^female$/i })).not.toBeChecked()
  await expect(page.getByLabel(/birth date/i)).toHaveValue('')
  await expect(page.getByLabel(/height/i)).toHaveValue('')
})

test('the Profile page saves the profile and reflects the new values', async ({
  page,
  goto,
}) => {
  // Start with no profile; after PUT, GET returns the new values.
  let saved: unknown = null
  await page.route('**/api/profile', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') {
      if (saved) return route.fulfill({ json: saved })
      return route.fulfill({ status: 404, json: { message: 'Not found' } })
    }
    if (req.method() === 'PUT') {
      saved = req.postDataJSON()
      return route.fulfill({ json: saved })
    }
    return route.fallback()
  })

  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByRole('radio', { name: /^male$/i }).click()
  await page.getByLabel(/birth date/i).fill('1990-06-15')
  await page.getByLabel(/height/i).fill('180')
  await page.getByRole('button', { name: /save profile/i }).click()

  await expect(page.getByRole('radio', { name: /^male$/i })).toBeChecked()
  await expect(page.getByLabel(/birth date/i)).toHaveValue('1990-06-15')
  await expect(page.getByLabel(/height/i)).toHaveValue('180')
})
