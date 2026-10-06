import type { Page, TestType } from '@playwright/test'
import type { NetworkFixture } from '@msw/playwright'
import { expect, test } from './support/network'
import {
  TOAST_DELETION_MS,
  toast,
  toastLiveRegion,
  toastRegion,
} from './support/toast'
import { localDayOf, localTodayIso } from './support/date'
import { failingWrite } from '../test/mocks/http'
import { bodyAndPlan } from '../test/mocks/handlers/body'
import { entryLog } from '../test/mocks/handlers/entries'
import { baselineProfile, savedProfile } from '../test/mocks/handlers/profile'

// The `goto` fixture's own type, taken from the `test` it belongs to rather
// than restated — @nuxt/test-utils declares it but does not export it.
type Goto =
  typeof test extends TestType<infer Args, infer _W>
    ? Args extends { goto: infer G }
      ? G
      : never
    : never

const PHONE = { width: 375, height: 812 }
const DESKTOP = { width: 1280, height: 800 }

/**
 * A Profile save the server fails while [isDown] holds, falling through to the
 * baseline User's saved Profile once it does not, so a save that lands is read
 * back on the next visit. A save is for [today], the page's local day.
 */
function profileSaves(today: string, isDown: () => boolean = () => true) {
  return [
    failingWrite('put', '/api/profile', isDown),
    ...savedProfile(baselineProfile, { today }).handlers,
  ]
}

/** Fill a new height in and save it, from the Profile page already open. */
async function saveHeight(page: Page, heightCm: string) {
  await page.getByLabel(/height/i).fill(heightCm)
  await page.getByRole('button', { name: /save profile/i }).click()
}

test('at phone width a failed save anchors the error toast to the top, clear of the sheet and keyboard zone', async ({
  page,
  goto,
  network,
}) => {
  // The save fails, so it surfaces the persistent error toast instead of
  // dismissing silently.
  network.use(...profileSaves(localTodayIso()))

  await page.setViewportSize(PHONE)
  await goto('/profile', { waitUntil: 'hydration' })

  await saveHeight(page, '182')

  const failure = toast(page, 'Could not save profile')
  await expect(failure).toBeVisible()
  // It carries a Retry affordance and persists (no auto-dismiss to count down).
  await expect(failure.getByRole('button', { name: /retry/i })).toBeVisible()

  // On a phone the bottom belt is owned by the open sheet's inputs and submit
  // button, the FAB/tab bar, and — whenever a field is focused — the software
  // keyboard. So the toast is anchored to the top: its whole body sits in the
  // top half of the viewport, never over the input the user was filling.
  await expect(async () => {
    const toastBox = await failure.boundingBox()
    expect(toastBox).not.toBeNull()
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(PHONE.height / 2)
  }).toPass()
})

test('at desktop width the error toast stays at the bottom, where nothing competes for the corner', async ({
  page,
  goto,
  network,
}) => {
  network.use(...profileSaves(localTodayIso()))

  await page.setViewportSize(DESKTOP)
  await goto('/profile', { waitUntil: 'hydration' })

  await saveHeight(page, '182')

  const failure = toast(page, 'Could not save profile')
  await expect(failure).toBeVisible()

  // Desktop has no keyboard to dodge and the form is a page, not a bottom
  // sheet, so the toast keeps the conventional bottom-right corner: its top
  // edge is in the bottom half of the viewport and its left edge past the
  // horizontal midpoint. Pinning both axes (not just "bottom") means the phone
  // and desktop assertions specify genuinely different anchors, so an inverted
  // breakpoint or a phone override leaking to desktop fails here.
  await expect(async () => {
    const toastBox = await failure.boundingBox()
    expect(toastBox).not.toBeNull()
    expect(toastBox!.y).toBeGreaterThanOrEqual(DESKTOP.height / 2)
    expect(toastBox!.x).toBeGreaterThanOrEqual(DESKTOP.width / 2)
  }).toPass()
})

test('the error toast Retry re-submits the save and dismisses once it succeeds', async ({
  page,
  goto,
  network,
}) => {
  // The first save fails and the retried one lands, so Retry drives failure →
  // success.
  let down = true
  network.use(...profileSaves(localTodayIso(), () => down))

  await goto('/profile', { waitUntil: 'hydration' })

  await saveHeight(page, '182')

  const failure = toast(page, 'Could not save profile')
  await expect(failure).toBeVisible()

  down = false
  await failure.getByRole('button', { name: /retry/i }).click()

  // The retried save succeeds, so the persistent error toast is dismissed.
  await expect(failure).toHaveCount(0)

  // And it was the save that Retry re-sent: the next visit reads it back.
  await page.reload()
  await expect(page.getByLabel(/height/i)).toHaveValue('182')
})

test('a Retry that fails again leaves the error toast up, ready to retry once more', async ({
  page,
  goto,
  network,
}) => {
  // The deletion Nuxt UI arms on a close is a `setTimeout`, and both ends of this
  // test are that timer: the bug only bites when the retried failure lands
  // *inside* the window, and it only shows once the deletion has run. A wall-clock
  // wait controls neither — it waits out the second while racing the first. So the
  // clock is held still: the retried failure cannot fall outside a window that is
  // not advancing, and the deletion fires when this test says so.
  const held = new Date('2026-06-15T12:00:00Z')
  await page.clock.install({ time: held })

  // Every save fails until the last Retry, so Retry drives failure → failure.
  let down = true
  network.use(...profileSaves(localDayOf(held), () => down))

  await goto('/profile', { waitUntil: 'hydration' })

  await saveHeight(page, '182')

  const failure = toast(page, 'Could not save profile')
  await expect(failure).toBeVisible()

  // Waited on rather than asserted: nothing on screen tells the retried failure
  // landing apart from the toast it replaces, and the deletion below has to run
  // after it.
  const retriedFailure = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.status() === 500,
  )
  await failure.getByRole('button', { name: /retry/i }).click()
  await retriedFailure

  // Run the armed deletion. Under the bug the replacement has been merged into
  // the toast it was raised onto, so this takes both away.
  await page.clock.runFor(TOAST_DELETION_MS)

  await expect(failure).toBeVisible()
  // One at a time, as ever: the toast the retry raises replaces the one it was
  // tapped on rather than stacking on it.
  await expect(toastRegion(page).getByRole('listitem')).toHaveCount(1)

  // And the Retry on it still fires, which is the whole reason to leave it up:
  // this time the save lands and dismisses the toast — on the same held timer,
  // so it is run once the save has landed.
  down = false
  const landed = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.status() === 200,
  )
  await failure.getByRole('button', { name: /retry/i }).click()
  await landed
  await page.clock.runFor(TOAST_DELETION_MS)
  await expect(failure).toHaveCount(0)
})

/**
 * Drive a weight save from inside the Log-weight sheet and make it fail while
 * [isDown] holds, leaving the sheet open with its error toast up.
 */
async function failASaveFromASheet(
  page: Page,
  goto: Goto,
  network: NetworkFixture,
  isDown: () => boolean = () => true,
) {
  network.use(
    failingWrite('post', '/api/weight', isDown),
    ...bodyAndPlan({
      profile: baselineProfile,
      readings: [],
      today: localTodayIso(),
    }),
  )

  await goto('/profile', { waitUntil: 'hydration' })

  const weight = page.getByRole('region', { name: /^weight$/i })
  await weight.getByRole('button', { name: /add weight/i }).click()
  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await sheet.getByLabel(/weight \(kg\)/i).fill('84.2')
  await sheet.getByRole('button', { name: /save weight/i }).click()
  return { weight, sheet }
}

test('a failed save from inside a sheet reaches the accessibility tree, Retry and all', async ({
  page,
  goto,
  network,
}) => {
  let down = true
  const { weight, sheet } = await failASaveFromASheet(
    page,
    goto,
    network,
    () => down,
  )

  // Queried through the accessibility tree, which is the whole point: the sheet
  // is a Reka Dialog, and a dialog marks everything outside itself aria-hidden.
  // The toast is portalled out of the dialog, so without the exemption it is
  // visible on screen and reachable by nobody using a screen reader — including
  // the Retry that is ADR 0005's only way back from a failed save.
  const failure = toast(page, 'Could not save weight')
  await expect(failure).toBeVisible()

  // Reachable, not merely present: the sheet's dim overlay covers the screen, so
  // a toast that fell behind it would read the same to `toBeVisible` and take no
  // clicks at all. The Retry lands the save, which the page then shows.
  down = false
  await failure.getByRole('button', { name: /retry/i }).click()
  await expect(sheet).toBeHidden()
  await expect(weight.getByText('84.2 kg')).toBeVisible()
})

test('a failed save from inside a sheet is announced assertively, interrupting whatever else was being read', async ({
  page,
  goto,
  network,
}) => {
  await failASaveFromASheet(page, goto, network)

  await expect(toast(page, 'Could not save weight')).toBeVisible()
  // ADR 0005 makes a failed mutation assertive on purpose — it interrupts
  // rather than waiting to be scrolled past — and the wrapper the toast is
  // portalled into is the live region that carries it.
  await expect(toastLiveRegion(page)).toHaveAttribute('aria-live', 'assertive')
})

test('a logged entry is announced politely, waiting its turn rather than interrupting', async ({
  page,
  goto,
  network,
}) => {
  // The budget gate previews before it commits (CONTEXT.md — Budget
  // Projection); both are answered by the Entry log.
  network.use(...entryLog({ today: localTodayIso(), foods: [] }))

  await goto('/log', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: /log an estimate instead/i }).click()
  const sheet = page.getByRole('dialog', { name: /log an estimate/i })
  await sheet.getByLabel('Label').fill('Lunch out')
  await sheet.getByLabel('Calories').fill('600')
  // A number field commits its value on blur, so leave it before submitting.
  await sheet.getByLabel('Calories').press('Tab')
  await sheet.getByRole('button', { name: /log estimated entry/i }).click()

  await expect(toast(page, 'Entry logged')).toBeVisible()
  // ADR 0005's other half: a success the user did not have to be interrupted
  // for. The same live region carries it, at the politeness of the toast in it.
  await expect(toastLiveRegion(page)).toHaveAttribute('aria-live', 'polite')
})
