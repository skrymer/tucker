import { expect, test } from './support/test'
import { pinToLocalMorning } from './support/date'
import { estimatedEntry, weighedEntry } from '../test/entry-fixtures'
import { dailyLogs } from '../test/mocks/handlers/entries'
import { profileOf, weightOnlyProfile } from '../test/mocks/handlers/profile'
import { held } from '../test/mocks/http'

// "Look up a day" on /review: an inline month that opens on today, and under it
// the Entries of whichever day is picked — read-only, with no verdict on it.

test('sits after the Intake Breakdown and lists a picked past day in full', async ({
  goto,
  network,
  page,
}) => {
  // Tue 16 Jun 2026, local.
  await pinToLocalMorning(page)
  network.use(
    ...dailyLogs({
      '2026-06-11': [
        weighedEntry({
          id: 1,
          foodId: 1,
          foodName: 'Rolled oats',
          grams: 60,
          calories: 233,
          protein: 8,
        }),
        estimatedEntry({
          id: 2,
          label: 'Pub burger',
          calories: 650,
          protein: 35,
        }),
        weighedEntry({
          id: 3,
          foodId: 2,
          foodName: 'Basmati rice',
          grams: 233,
          calories: 305,
          protein: 6,
        }),
      ],
    }),
  )

  await goto('/review', { waitUntil: 'hydration' })

  const card = page.getByRole('region', { name: 'Look up a day' })
  await expect(
    page
      .getByRole('region', { name: "What you're eating" })
      .locator('xpath=following-sibling::*[1]'),
  ).toHaveAccessibleName('Look up a day')

  await card.getByRole('button', { name: 'Thursday, June 11, 2026' }).click()
  await expect(card.getByRole('region', { name: 'Thu 11 Jun' })).toBeVisible()

  await expect(card).toMatchAriaSnapshot()
})

// ADR 0007: a placeholder waits 150 ms before showing, so a fast answer never
// flashes it. Read at the moment the skeleton is inserted, before any delay.
test('holds the cold-load skeleton invisible for its first moment', async ({
  goto,
  network,
  page,
}) => {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>(
        '[data-testid="day-skeleton"]',
      )
      if (el && el.dataset.firstOpacity === undefined) {
        el.dataset.firstOpacity = getComputedStyle(el).opacity
      }
    }).observe(document, { childList: true, subtree: true })
  })
  const read = held('get', '/api/entries')
  network.use(read.handler)

  await goto('/review', { waitUntil: 'hydration' })
  const skeleton = page.getByTestId('day-skeleton')

  await expect(skeleton).toHaveAttribute('data-first-opacity', '0')
  await expect
    .poll(() => skeleton.evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1')
  read.release()
  await expect(skeleton).toHaveCount(0)
})

test('is absent with Calorie Tracking off', async ({ goto, network, page }) => {
  network.use(profileOf(weightOnlyProfile))

  await goto('/review', { waitUntil: 'hydration' })

  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Look up a day' }),
  ).not.toBeAttached()
})
