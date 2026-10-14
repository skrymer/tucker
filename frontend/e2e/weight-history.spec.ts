import { expect, test } from './support/test'
import { pinToLocalMorning } from './support/date'
import { toastRegion } from './support/toast'
import { steadyDays, weightTimeline } from '../test/weight-timeline-fixtures'
import { bodyAndPlan } from '../test/mocks/handlers/body'
import { weightOnlyProfile } from '../test/mocks/handlers/profile'
import { weightTimelineOf } from '../test/mocks/handlers/weight-timeline'

// "Weight history" on /review: an inline month that opens on today, a dot on
// every day holding a Weight Measurement, and under it the picked day's reading
// or an offer to add one — for a User who does not track calories too.

test('sits under the Weight Timeline and backfills a missed day', async ({
  goto,
  network,
  page,
}) => {
  // Tue 16 Jun 2026, local.
  const today = await pinToLocalMorning(page)
  network.use(
    weightTimelineOf(weightTimeline({ days: steadyDays(28, today, 80) })),
    ...bodyAndPlan({
      profile: weightOnlyProfile,
      today,
      readings: [{ id: 1, measuredOn: '2026-06-11', weightKg: 81.2 }],
    }),
  )

  await goto('/review', { waitUntil: 'hydration' })

  const card = page.getByRole('region', { name: 'Weight history' })
  await expect(
    page
      .getByRole('region', { name: 'Your weight' })
      .locator('xpath=following-sibling::*[1]'),
  ).toHaveAccessibleName('Weight history')
  await expect(card.getByText('No weight on Tue 16 Jun.')).toBeVisible()

  await card.getByRole('button', { name: 'Saturday, June 13, 2026' }).click()
  await card.getByRole('button', { name: 'Add weight' }).click()
  await page.getByLabel('Weight (kg)').fill('80.6')
  await page.keyboard.press('Tab')
  await page.getByRole('button', { name: 'Save weight' }).click()

  await expect(card.getByText('80.6 kg')).toBeVisible()
  await expect(card).toMatchAriaSnapshot()
})

test("corrects a picked day's reading, prefilled and quietly", async ({
  goto,
  network,
  page,
}) => {
  // Tue 16 Jun 2026, local.
  const today = await pinToLocalMorning(page)
  network.use(
    weightTimelineOf(weightTimeline({ days: steadyDays(28, today, 80) })),
    ...bodyAndPlan({
      profile: weightOnlyProfile,
      today,
      readings: [{ id: 1, measuredOn: '2026-06-11', weightKg: 81.2 }],
    }),
  )

  await goto('/review', { waitUntil: 'hydration' })

  const card = page.getByRole('region', { name: 'Weight history' })
  await card.getByRole('button', { name: 'Thursday, June 11, 2026' }).click()
  await expect(card.getByText('81.2 kg')).toBeVisible()
  await card.getByRole('button', { name: 'Edit' }).click()

  const sheet = page.getByRole('dialog', { name: 'Log weight' })
  await expect(sheet.getByLabel('Weight (kg)')).toHaveValue('81.2')
  await expect(sheet.getByLabel('Date')).toHaveCount(0)
  await sheet.getByLabel('Weight (kg)').fill('80.4')
  await page.keyboard.press('Tab')
  await sheet.getByRole('button', { name: 'Save weight' }).click()

  await expect(sheet).toBeHidden()
  await expect(card.getByText('80.4 kg')).toBeVisible()
  await expect(card.getByText('81.2 kg')).toHaveCount(0)
  await expect(toastRegion(page).getByRole('listitem')).toHaveCount(0)
  await expect(card).toMatchAriaSnapshot()
})
