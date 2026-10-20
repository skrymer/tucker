import { expect, test } from './support/test'
import { pinToLocalMorning } from './support/date'
import { sampleDialogText } from './support/dialog'
import { toastRegion } from './support/toast'
import { steadyDays, weightTimeline } from '../test/weight-timeline-fixtures'
import { estimatedEntry, weighedEntry } from '../test/entry-fixtures'
import { bodyAndPlan } from '../test/mocks/handlers/body'
import { dailyLogs } from '../test/mocks/handlers/entries'
import { weightOnlyProfile } from '../test/mocks/handlers/profile'
import { weightTimelineOf } from '../test/mocks/handlers/weight-timeline'
import { held } from '../test/mocks/http'

// "History" on /review: an inline month that opens on today, a ring on every
// day holding a Weight Measurement and a dot on every day holding Entries, and
// under it the picked day's reading — or an offer to add one — and its Entries,
// read-only. A User who does not track calories gets the weight half alone.

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

  const card = page.getByRole('region', { name: 'History' })
  await expect(
    page
      .getByRole('region', { name: 'Your weight' })
      .locator('xpath=following-sibling::*[1]'),
  ).toHaveAccessibleName('History')
  await expect(card.getByText('No weight.')).toBeVisible()

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

  const card = page.getByRole('region', { name: 'History' })
  await card.getByRole('button', { name: 'Thursday, June 11, 2026' }).click()
  await expect(card.getByText('81.2 kg')).toBeVisible()
  await card.getByRole('button', { name: 'Edit weight on Thu 11 Jun' }).click()

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

test('keeps naming the reading while its delete confirm closes', async ({
  goto,
  network,
  page,
}) => {
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
  const card = page.getByRole('region', { name: 'History' })
  await card.getByRole('button', { name: 'Thursday, June 11, 2026' }).click()
  await card
    .getByRole('button', { name: 'Delete weight on Thu 11 Jun' })
    .click()
  const confirm = page.getByRole('dialog', { name: 'Delete this weight?' })
  await expect(confirm).toBeVisible()
  const seen = await sampleDialogText(page)
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  await expect(confirm).toBeHidden()

  const frames = await seen()
  expect(frames.length).toBeGreaterThan(1)
  expect(
    frames.filter(
      (text) => !text.includes('81.2 kg on Thu 11 Jun will be removed'),
    ),
  ).toEqual([])
})

test("deletes a picked day's reading once confirmed, and quietly", async ({
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

  const card = page.getByRole('region', { name: 'History' })
  await card.getByRole('button', { name: 'Thursday, June 11, 2026' }).click()
  await card
    .getByRole('button', { name: 'Delete weight on Thu 11 Jun' })
    .click()

  const confirm = page.getByRole('dialog', { name: 'Delete this weight?' })
  await expect(confirm).toContainText(
    '81.2 kg on Thu 11 Jun will be removed, and your trend weight re-derives without it.',
  )
  await confirm.getByRole('button', { name: 'Delete' }).click()

  await expect(confirm).toBeHidden()
  await expect(card.getByText('No weight.')).toBeVisible()
  await expect(toastRegion(page).getByRole('listitem')).toHaveCount(0)
  await expect(card).toMatchAriaSnapshot()
})

test("lists a picked past day's reading and its last three Entries, then all of them", async ({
  goto,
  network,
  page,
}) => {
  // Tue 16 Jun 2026, local.
  const today = await pinToLocalMorning(page)
  network.use(
    ...bodyAndPlan({
      profile: null,
      today,
      readings: [{ id: 1, measuredOn: '2026-06-11', weightKg: 81.2 }],
    }),
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

  const card = page.getByRole('region', { name: 'History' })
  await card.getByRole('button', { name: 'Thursday, June 11, 2026' }).click()
  const day = card.getByRole('region', { name: 'Thu 11 Jun' })
  await expect(day.getByText('4 entries · 1,287 kcal')).toBeVisible()

  await expect(card).toMatchAriaSnapshot()

  const entries = day.getByRole('region', { name: 'Entries' })
  await entries.getByRole('button', { name: 'Show all 4' }).click()
  await expect(entries).toMatchAriaSnapshot(`
    - region "Entries":
      - /children: deep-equal
      - heading "Entries" [level=4]
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
test("holds the Entries' cold-load skeleton invisible for its first moment", async ({
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

// A mark has no accessible form, so the aria snapshot cannot see it: which days
// carry one, and that it is painted, is read off the DOM.
test('rings the days holding a reading and dots the days holding Entries, side by side on a day with both', async ({
  goto,
  network,
  page,
}) => {
  // Tue 16 Jun 2026, local.
  const today = await pinToLocalMorning(page)
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
    ...bodyAndPlan({
      profile: null,
      today,
      readings: [
        { id: 1, measuredOn: '2026-06-10', weightKg: 81.4 },
        { id: 2, measuredOn: '2026-06-11', weightKg: 81.2 },
      ],
    }),
    ...dailyLogs({ '2026-06-11': [oats(1)], '2026-06-12': [oats(2)] }),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'History' })

  await expect
    .poll(() =>
      card
        .locator('[data-slot="cellTrigger"] [data-mark]')
        .evaluateAll((marks) =>
          marks.map((mark) => ({
            day: mark
              .closest('[data-slot="cellTrigger"]')!
              .getAttribute('aria-label'),
            mark: mark.getAttribute('data-mark'),
            fill: getComputedStyle(mark).backgroundColor,
            ring: getComputedStyle(mark).boxShadow.includes('rgb(0, 193, 106)'),
          })),
        ),
    )
    .toEqual([
      {
        day: 'Wednesday, June 10, 2026',
        mark: 'weigh-in',
        fill: 'rgba(0, 0, 0, 0)',
        ring: true,
      },
      {
        day: 'Thursday, June 11, 2026',
        mark: 'weigh-in',
        fill: 'rgba(0, 0, 0, 0)',
        ring: true,
      },
      {
        day: 'Thursday, June 11, 2026',
        mark: 'entries',
        fill: 'rgb(0, 193, 106)',
        ring: false,
      },
      {
        day: 'Friday, June 12, 2026',
        mark: 'entries',
        fill: 'rgb(0, 193, 106)',
        ring: false,
      },
    ])
})

test("a neighbouring month's day dims its marks with its numeral", async ({
  goto,
  network,
  page,
}) => {
  // Tue 16 Jun 2026, local. May's six weeks open on Mon 27 Apr.
  const today = await pinToLocalMorning(page)
  network.use(
    ...bodyAndPlan({
      profile: null,
      today,
      readings: [{ id: 1, measuredOn: '2026-04-28', weightKg: 81.9 }],
    }),
    ...dailyLogs({
      '2026-04-28': [
        weighedEntry({
          id: 1,
          foodId: 1,
          foodName: 'Rolled oats',
          grams: 60,
          calories: 233,
          protein: 8,
        }),
      ],
    }),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'History' })
  await card.getByRole('button', { name: 'Previous month' }).click()
  const spillover = card.getByRole('button', {
    name: 'Tuesday, April 28, 2026',
  })
  await expect(spillover).toHaveAttribute('data-outside-view', '')

  await expect
    .poll(() =>
      spillover.evaluate((cell) => {
        const text = getComputedStyle(cell).color
        const [ring, dot] = ['weigh-in', 'entries'].map((mark) =>
          getComputedStyle(cell.querySelector(`[data-mark="${mark}"]`)!),
        )
        return {
          ringIsText: ring!.boxShadow.includes(text),
          dotIsText: dot!.backgroundColor === text,
          textIsPrimary: text === 'rgb(0, 193, 106)',
        }
      }),
    )
    .toEqual({ ringIsText: true, dotIsText: true, textIsPrimary: false })
})

test('is the weight half alone with Calorie Tracking off', async ({
  goto,
  network,
  page,
}) => {
  // Tue 16 Jun 2026, local.
  const today = await pinToLocalMorning(page)
  network.use(
    ...bodyAndPlan({
      profile: weightOnlyProfile,
      today,
      readings: [{ id: 1, measuredOn: '2026-06-11', weightKg: 81.2 }],
    }),
  )

  await goto('/review', { waitUntil: 'hydration' })

  const card = page.getByRole('region', { name: 'History' })
  await expect(card.getByText('No weight.')).toBeVisible()
  await expect(card.getByRole('region', { name: 'Entries' })).toHaveCount(0)
  await expect(
    card.getByRole('button', { name: 'Wednesday, June 17, 2026' }),
  ).toBeDisabled()
  await expect(card.getByTestId('calendar-legend')).toHaveText('Weigh-in')
})
