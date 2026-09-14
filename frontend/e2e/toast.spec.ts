import type { Page, TestType } from '@playwright/test'
import { expect, test } from './support/test'
import {
  TOAST_DELETION_MS,
  toast,
  toastLiveRegion,
  toastRegion,
} from './support/toast'
import {
  mockFoods,
  mockFrequentFoods,
  mockProfile,
  mockWeightList,
} from './support/mock-api'
import { estimatedEntry } from '../test/entry-fixtures'

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

// The profile the stub below hands back, so the form loads populated.
const SAVED = { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 }

/**
 * Stub `/api/profile`: GET hands back the saved profile so the form loads
 * populated, and every PUT fails until the one numbered [succeedFrom]. Returns
 * the counter of PUTs that reached it, so a caller can tell a Retry that fired
 * from one that didn't.
 */
async function failProfileSaves(page: Page, { succeedFrom = Infinity } = {}) {
  const puts = { count: 0 }
  await page.route('**/api/profile*', async (route) => {
    const req = route.request()
    if (req.method() === 'GET') return route.fulfill({ json: SAVED })
    if (req.method() !== 'PUT') return route.fallback()
    puts.count += 1
    if (puts.count >= succeedFrom)
      return route.fulfill({ json: req.postDataJSON() })
    return route.fulfill({ status: 500, json: { message: 'boom' } })
  })
  return puts
}

test('at phone width a failed save anchors the error toast to the top, clear of the sheet and keyboard zone', async ({
  page,
  goto,
}) => {
  // The save fails, so it surfaces the persistent error toast instead of
  // dismissing silently.
  await failProfileSaves(page)

  await page.setViewportSize(PHONE)
  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByLabel(/height/i).fill('182')
  await page.getByRole('button', { name: /save profile/i }).click()

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
}) => {
  await failProfileSaves(page)

  await page.setViewportSize(DESKTOP)
  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByLabel(/height/i).fill('182')
  await page.getByRole('button', { name: /save profile/i }).click()

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
}) => {
  // The first PUT fails and the second succeeds, so Retry drives failure →
  // success.
  const puts = await failProfileSaves(page, { succeedFrom: 2 })

  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByLabel(/height/i).fill('182')
  await page.getByRole('button', { name: /save profile/i }).click()

  const failure = toast(page, 'Could not save profile')
  await expect(failure).toBeVisible()

  await failure.getByRole('button', { name: /retry/i }).click()

  // The retried save succeeds, so the persistent error toast is dismissed.
  await expect(failure).toHaveCount(0)
  expect(puts.count).toBe(2)
})

test('a Retry that fails again leaves the error toast up, ready to retry once more', async ({
  page,
  goto,
}) => {
  // Every PUT fails, so Retry drives failure → failure.
  const puts = await failProfileSaves(page)

  // The deletion Nuxt UI arms on a close is a `setTimeout`, and both ends of this
  // test are that timer: the bug only bites when the retried failure lands
  // *inside* the window, and it only shows once the deletion has run. A wall-clock
  // wait controls neither — it waits out the second while racing the first. So the
  // clock is held still: the retried failure cannot fall outside a window that is
  // not advancing, and the deletion fires when this test says so.
  await page.clock.install({ time: new Date('2026-06-15T12:00:00Z') })

  await goto('/profile', { waitUntil: 'hydration' })

  await page.getByLabel(/height/i).fill('182')
  await page.getByRole('button', { name: /save profile/i }).click()

  const failure = toast(page, 'Could not save profile')
  await expect(failure).toBeVisible()

  await failure.getByRole('button', { name: /retry/i }).click()
  await expect.poll(() => puts.count).toBe(2)

  // Run the armed deletion. Under the bug the replacement has been merged into
  // the toast it was raised onto, so this takes both away.
  await page.clock.runFor(TOAST_DELETION_MS)

  await expect(failure).toBeVisible()
  // One at a time, as ever: the toast the retry raises replaces the one it was
  // tapped on rather than stacking on it.
  await expect(toastRegion(page).getByRole('listitem')).toHaveCount(1)
  // And the Retry on it still fires, which is the whole reason to leave it up.
  await failure.getByRole('button', { name: /retry/i }).click()
  await expect.poll(() => puts.count).toBe(3)
})

/**
 * Drive a weight save from inside the Log-weight sheet and make it fail, leaving
 * the sheet open with its error toast up. Returns a counter of the saves that
 * reached the API, so a caller can tell a Retry that fired from one that didn't.
 */
async function failASaveFromASheet(page: Page, goto: Goto) {
  const saves = { count: 0 }
  await mockProfile(page, SAVED)
  await mockWeightList(page, [])
  // Registered after the list stub, so it is matched first (Playwright tries
  // routes newest-first) and hands the reads back to it.
  await page.route('**/api/weight', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    saves.count += 1
    return route.fulfill({ status: 500, json: { message: 'boom' } })
  })

  await goto('/profile', { waitUntil: 'hydration' })

  const weight = page.getByRole('region', { name: /^weight$/i })
  await weight.getByRole('button', { name: /add weight/i }).click()
  const sheet = page.getByRole('dialog', { name: /log weight/i })
  await sheet.getByLabel(/weight \(kg\)/i).fill('84.2')
  await sheet.getByRole('button', { name: /save weight/i }).click()
  return saves
}

test('a failed save from inside a sheet reaches the accessibility tree, Retry and all', async ({
  page,
  goto,
}) => {
  const saves = await failASaveFromASheet(page, goto)

  // Queried through the accessibility tree, which is the whole point: the sheet
  // is a Reka Dialog, and a dialog marks everything outside itself aria-hidden.
  // The toast is portalled out of the dialog, so without the exemption it is
  // visible on screen and reachable by nobody using a screen reader — including
  // the Retry that is ADR 0005's only way back from a failed save.
  const failure = toast(page, 'Could not save weight')
  await expect(failure).toBeVisible()

  // Reachable, not merely present: the sheet's dim overlay covers the screen, so
  // a toast that fell behind it would read the same to `toBeVisible` and take no
  // clicks at all.
  await failure.getByRole('button', { name: /retry/i }).click()
  await expect.poll(() => saves.count).toBe(2)
})

test('a failed save from inside a sheet is announced assertively, interrupting whatever else was being read', async ({
  page,
  goto,
}) => {
  await failASaveFromASheet(page, goto)

  await expect(toast(page, 'Could not save weight')).toBeVisible()
  // ADR 0005 makes a failed mutation assertive on purpose — it interrupts
  // rather than waiting to be scrolled past — and the wrapper the toast is
  // portalled into is the live region that carries it.
  await expect(toastLiveRegion(page)).toHaveAttribute('aria-live', 'assertive')
})

test('a logged entry is announced politely, waiting its turn rather than interrupting', async ({
  page,
  goto,
}) => {
  await mockProfile(page, { ...SAVED, tracksCalories: true })
  await mockFoods(page, [])
  await mockFrequentFoods(page, [])
  // The budget gate previews before it commits (CONTEXT.md — Budget Projection),
  // so both endpoints need stubbing. The preview is registered last, hence
  // matched first — though the commit glob would not swallow it either, since a
  // Playwright pattern has to match the whole URL and `/preview` is left over.
  await page.route('**/api/entries/estimated', (route) =>
    route.fulfill({
      json: estimatedEntry({ id: 1, label: 'Lunch out', calories: 600 }),
    }),
  )
  await page.route('**/api/entries/estimated/preview', (route) =>
    route.fulfill({
      json: { wouldExceedBudget: false, projectedCaloriesConsumed: 600 },
    }),
  )

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
