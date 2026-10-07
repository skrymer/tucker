import { estimatedEntry, weighedEntry } from '../test/entry-fixtures'
import { http } from '../test/mocks/http'
import { dailyLogs } from '../test/mocks/handlers/entries'
import { goalInProgress } from '../test/mocks/handlers/goal'
import {
  summaryFails,
  summaryOf,
  type SummaryDay,
} from '../test/mocks/handlers/summary'
import { weightMeasurements } from '../test/mocks/handlers/weight'
import { expect, test } from './support/test'
import { pinToLocalMorning } from './support/date'
import { rings } from './support/ring'

// The baseline was last weighed on a day long past and has no Goal, so
// Today offers to log a weight and shows no Goal ring unless a test says so.

/**
 * An on-target day with two Entries on it — the resting shape Today renders.
 * The Entries add up to the day's figures, as the backend's would.
 */
const DAY_WITH_ENTRIES: SummaryDay = {
  caloriesConsumed: 1500,
  proteinConsumed: 140,
  estimatedCalorieShare: 0,
  setupComplete: true,
  calorieBudget: 2000,
  proteinFloor: 140,
  caloriesRemaining: 500,
  dayStatus: 'on-target',
  entries: [
    weighedEntry({
      id: 1,
      calories: 240,
      protein: 8,
      foodId: 3,
      foodName: 'Oats',
      grams: 60,
    }),
    estimatedEntry({
      id: 2,
      calories: 1260,
      protein: 132,
      label: 'Steak dinner',
    }),
  ],
}

test('the Today page shows the daily summary from the API', async ({
  page,
  goto,
  network,
}) => {
  // Pinned, because the day lists are headed with the date.
  await pinToLocalMorning(page)
  network.use(summaryOf(DAY_WITH_ENTRIES))

  await goto('/', { waitUntil: 'hydration' })

  // A closed-world baseline of the whole resting page, which is what carries
  // "Today never logs an Entry": no header button, and no phone FAB either.
  // Playwright keeps one baseline per project (Desktop / Mobile Chrome), and
  // with the FAB gone the two now read alike.
  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

test("tomorrow's Entries are listed below today's, under their own day", async ({
  page,
  goto,
  network,
}) => {
  await pinToLocalMorning(page)
  network.use(
    summaryOf(DAY_WITH_ENTRIES),
    ...dailyLogs({
      '2026-06-17': [
        estimatedEntry({
          id: 3,
          loggedOn: '2026-06-17',
          calories: 620,
          protein: 48,
          label: 'Prepped chicken & rice',
        }),
        weighedEntry({
          id: 4,
          loggedOn: '2026-06-17',
          calories: 568,
          protein: 20,
          foodId: 3,
          foodName: 'Oats',
          grams: 150,
        }),
      ],
    }),
  )

  await goto('/', { waitUntil: 'hydration' })

  // Today's figures are unchanged by tomorrow's Entries: the ring, the verdict
  // and today's list read exactly as on the page without them.
  await expect(page.getByRole('main')).toMatchAriaSnapshot()
})

test('a day list never breaks its day or its tally across lines', async ({
  page,
  goto,
  network,
}) => {
  await pinToLocalMorning(page)
  network.use(
    summaryOf(DAY_WITH_ENTRIES),
    ...dailyLogs({
      '2026-06-17': [
        estimatedEntry({
          id: 3,
          loggedOn: '2026-06-17',
          calories: 1188,
          label: 'Prepped chicken & rice',
        }),
      ],
    }),
  )

  await goto('/', { waitUntil: 'hydration' })

  // A header too wide for one phone row: the tally must move under the day,
  // inside the card, rather than squeeze either one onto a second line.
  const tomorrow = page.getByRole('region', { name: 'Tomorrow · Wed 17 Jun' })
  for (const part of [
    tomorrow.getByRole('heading'),
    tomorrow.getByText('1 entry · 1,188 kcal'),
  ]) {
    const lines = await part.evaluate(
      (el) =>
        el.getBoundingClientRect().height /
        parseFloat(getComputedStyle(el).lineHeight),
    )
    expect(Math.round(lines)).toBe(1)
  }
  const overflow = await tomorrow.evaluate((section) => {
    const tally = [...section.querySelectorAll('p')].find((p) =>
      p.textContent?.includes('1,188 kcal'),
    )!
    return (
      tally.getBoundingClientRect().right -
      (section.getBoundingClientRect().right -
        parseFloat(getComputedStyle(section).paddingRight))
    )
  })
  expect(overflow).toBeLessThanOrEqual(0)
})

test('an open Today moves on to the next day at local midnight', async ({
  page,
  goto,
  network,
}) => {
  // 23:59:30 on 16 June in the mocked browser's zone (Brisbane, UTC+10).
  await page.clock.install({ time: new Date('2026-06-16T13:59:30Z') })
  network.use(
    summaryOf(DAY_WITH_ENTRIES),
    ...dailyLogs({
      '2026-06-17': [
        estimatedEntry({
          id: 3,
          loggedOn: '2026-06-17',
          calories: 620,
          label: 'Prepped chicken & rice',
        }),
      ],
    }),
  )

  await goto('/', { waitUntil: 'hydration' })
  await expect(
    page.getByRole('region', { name: 'Today · Tue 16 Jun' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Tomorrow · Wed 17 Jun' }),
  ).toBeVisible()

  await page.clock.runFor(60_000)

  await expect(
    page.getByRole('region', { name: 'Today · Wed 17 Jun' }),
  ).toBeVisible()
  // The 18th has nothing logged, so there is no Tomorrow list left to show.
  await expect(page.getByRole('region', { name: /^Tomorrow · / })).toHaveCount(
    0,
  )
})

test("logging a weight from the tile shows it as today's weight", async ({
  page,
  goto,
  network,
}) => {
  network.use(...weightMeasurements(null))

  await goto('/', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Log weight' }).click()
  await page.getByLabel(/weight \(kg\)/i).fill('84.2')
  await page
    .getByRole('dialog', { name: /log weight/i })
    .getByRole('button', { name: /save weight/i })
    .click()

  // The tile flips into logged-today state with the value and an edit affordance.
  await expect(page.getByText('84.2 kg')).toBeVisible()
  await expect(
    page.getByRole('button', { name: /edit today's weight/i }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log weight' })).toHaveCount(0)
})

test('the weight sheet stays put, reporting busy, until the save lands', async ({
  page,
  goto,
  network,
}) => {
  // Hold the save open so the in-flight window is observable. It answers
  // nothing, so once released the save falls through to the scale behind it.
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  network.use(
    http.post('/api/weight', async () => {
      await held
    }),
    ...weightMeasurements(null),
  )

  await goto('/', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Log weight' }).click()
  await page.getByLabel(/weight \(kg\)/i).fill('84.2')
  const sheet = page.getByRole('dialog', { name: /log weight/i })
  const save = sheet.getByRole('button', { name: /save weight/i })
  await save.click()

  await expect(save).toBeDisabled()

  // The sheet is the confirmation, so nothing may take it away mid-save: losing
  // it here would leave no sheet, no spinner and no way to tell whether the
  // reading landed. ResponsiveOverlay is non-dismissible unless a sheet asks
  // for it (UModal's `dismissible` is Boolean-cast, so absent reads as false),
  // and this pins that the weight sheet never does. Read `data-state`, not
  // visibility: a dismissed Reka dialog stays mounted and visible for its exit
  // animation, so `toBeVisible()` would pass on the first poll either way.
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveAttribute('data-state', 'open')

  release()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('84.2 kg')).toBeVisible()
})

test("shows a retryable error instead of an empty dashboard when today's summary fails to load", async ({
  page,
  goto,
  network,
}) => {
  network.use(summaryFails())

  await goto('/', { waitUntil: 'hydration' })

  await expect(
    page.getByRole('heading', { name: "Couldn't load today's summary" }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})

test('the day ring and the goal ring are peers at the same size', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    summaryOf({ ...DAY_WITH_ENTRIES, trendWeightKg: 86, entries: [] }),
    goalInProgress(),
  )

  await goto('/', { waitUntil: 'hydration' })

  // Both centres render — the day's remaining calories and the goal's kg to go.
  await expect(page.getByText('500', { exact: true })).toBeVisible()
  await expect(page.getByText('6.0', { exact: true })).toBeVisible()

  // DESIGN.md's two-ring rule is a rule about size, so it is checked as one:
  // sizing either down would rank weight against calories.
  const gauges = rings(page)
  await expect(gauges).toHaveCount(2)
  const day = (await gauges.nth(0).boundingBox())!
  const goal = (await gauges.nth(1).boundingBox())!
  expect(goal.width).toBe(day.width)
  expect(goal.height).toBe(day.height)

  // And they stack rather than collide, at whichever viewport this project runs.
  expect(goal.y).toBeGreaterThanOrEqual(day.y + day.height)
})

test('a name long enough to clip never squeezes the flag beside it', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    summaryOf({
      ...DAY_WITH_ENTRIES,
      entries: [
        estimatedEntry({ id: 1, calories: 240, protein: 8, label: 'Toast' }),
        estimatedEntry({
          id: 2,
          calories: 240,
          protein: 8,
          // Longer than any phone column, so the name must clip rather than
          // push the flag off the row.
          label: 'RECONSTITUTED LONG LIFE FULL CREAM DAIRY MILK BEVERAGE',
        }),
      ],
    }),
  )

  await goto('/', { waitUntil: 'hydration' })

  const rows = page.getByRole('main').getByRole('listitem')
  const shortFlag = rows.filter({ hasText: 'Toast' }).getByText('est.')
  const longFlag = rows
    .filter({ hasText: 'Reconstituted long life' })
    .getByText('est.')

  // The marker qualifies the name, so it has to survive beside one of any
  // length — it is `shrink-0` for this reason, and without it the flex line
  // takes the width back from the badge rather than from the name.
  await expect(longFlag).toBeVisible()
  const short = await shortFlag.boundingBox()
  const long = await longFlag.boundingBox()
  expect(long!.width).toBeCloseTo(short!.width, 0)
})
