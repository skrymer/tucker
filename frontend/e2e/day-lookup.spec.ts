import { expect, test } from './support/test'
import { pinToLocalMorning } from './support/date'
import { estimatedEntry, weighedEntry } from '../test/entry-fixtures'
import { dailyLogs } from '../test/mocks/handlers/entries'
import { profileOf, weightOnlyProfile } from '../test/mocks/handlers/profile'
import { held } from '../test/mocks/http'

// "Look up a day" on /review: an inline month that opens on today, and under it
// the Entries of whichever day is picked — read-only, with no verdict on it.

test("sits after the Intake Breakdown and lists a picked past day's last three Entries, then all of them", async ({
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
        weighedEntry({
          id: 4,
          foodId: 3,
          foodName: 'Greek yoghurt',
          grams: 170,
          calories: 99,
          protein: 17,
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
  const day = card.getByRole('region', { name: 'Thu 11 Jun' })
  await expect(day).toBeVisible()

  await expect(card).toMatchAriaSnapshot()

  await day.getByRole('button', { name: 'Show all 4' }).click()
  await expect(day).toMatchAriaSnapshot(`
    - region "Thu 11 Jun":
      - /children: deep-equal
      - heading "Thu 11 Jun" [level=3]
      - paragraph: 4 entries · 1,287 kcal
      - list:
        - listitem: Rolled oats 60 g · 233 kcal · 8 g protein
        - listitem: Pub burger est. 650 kcal · 35 g protein
        - listitem: Basmati rice 233 g · 305 kcal · 6 g protein
        - listitem: Greek yoghurt 170 g · 99 kcal · 17 g protein
      - button "Show less"
  `)
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
  // Nothing has been answered yet, so there is no last answer to dim.
  await page.waitForTimeout(400)
  expect(
    await skeleton
      .locator('xpath=ancestor::section[1]')
      .evaluate((el) => getComputedStyle(el).opacity),
  ).toBe('1')
  read.release()
  await expect(skeleton).toHaveCount(0)
})

// A dot has no accessible form, so the aria snapshot cannot see it: which days
// carry one, and that it is painted, is read off the DOM.
test('dots the days that hold Entries, and no other', async ({
  goto,
  network,
  page,
}) => {
  // Tue 16 Jun 2026, local.
  await pinToLocalMorning(page)
  const oats = (id: number) =>
    weighedEntry({
      id,
      foodId: 1,
      foodName: 'Rolled oats',
      grams: 60,
      calories: 233,
      protein: 8,
    })
  network.use(
    ...dailyLogs({ '2026-06-11': [oats(1)], '2026-06-12': [oats(2)] }),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'Look up a day' })

  await expect
    .poll(() =>
      card
        .locator('[data-slot="cellTrigger"] [data-slot="base"]')
        .evaluateAll((dots) =>
          dots.map((dot) => ({
            day: dot
              .closest('[data-slot="cellTrigger"]')!
              .getAttribute('aria-label'),
            painted: getComputedStyle(dot).backgroundColor,
          })),
        ),
    )
    .toEqual([
      { day: 'Thursday, June 11, 2026', painted: 'rgb(0, 193, 106)' },
      { day: 'Friday, June 12, 2026', painted: 'rgb(0, 193, 106)' },
    ])
})

test('is absent with Calorie Tracking off', async ({ goto, network, page }) => {
  network.use(profileOf(weightOnlyProfile))

  await goto('/review', { waitUntil: 'hydration' })

  await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Look up a day' }),
  ).not.toBeAttached()
})
