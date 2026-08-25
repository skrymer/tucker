import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'
import { tickAt, sentPayloads } from './support/reminder-tick'

// F6 slice 3 smoke (reminder cron + sender): force an overdue + absent state and
// drive the reminder job. The first tick, at the user's reminder hour, sends a push
// to the subscribed device; a second tick in the same overdue episode is deduped —
// no second nudge (ADR 0010). This proves the wired ReminderPolicy → scheduler →
// subscription-store → dedupe path against the real backend; the web-push transport
// is faked at its boundary by the smoke-profile sender (no real push service exists
// in a smoke, the same reason the enable-reminders smoke stubs PushManager). The
// ticks are driven through a smoke-only endpoint at a pinned instant so the local
// reminder hour is deterministic. Runs at both viewports (Desktop + Mobile Chrome).
//
// The nudge's *words* follow Calorie Tracking, so each test asserts the copy its User
// earns — read back off the tick, because a `sent` count reads the same whatever the
// nudge says.

const API = 'http://localhost:8080/api'
const REMINDER_HOUR = 9
const DEVICE_ENDPOINT = 'https://push.example/reminder-smoke-device'

/**
 * Everything one User needs to be owed a reminder: a Profile with reminders on at
 * [REMINDER_HOUR], a reading so setup is complete, a summary read eight days ago (which
 * bootstraps a Weekly Review dated then — now a week overdue — and stamps last-seen in
 * the past), and a device to push to.
 */
async function seedEligible(
  request: APIRequestContext,
  today: string,
  { tracksCalories = true }: { tracksCalories?: boolean } = {},
) {
  const profileRes = await request.put(`${API}/profile`, {
    data: {
      sex: 'MALE',
      birthDate: '1986-05-22',
      heightCm: 180,
      timezone: 'UTC',
      reminderHour: REMINDER_HOUR,
      remindersEnabled: true,
      tracksCalories,
    },
  })
  expect(profileRes.ok()).toBe(true)

  expect(
    (
      await request.post(`${API}/weight`, {
        data: { date: today, weightKg: 86 },
      })
    ).ok(),
  ).toBe(true)

  expect(
    (
      await request.get(`${API}/summary`, {
        params: { date: isoShiftDays(today, -8) },
      })
    ).ok(),
  ).toBe(true)

  // Register a device for push (the browser PushSubscription JSON shape).
  const subRes = await request.post(`${API}/push/subscriptions`, {
    data: {
      endpoint: DEVICE_ENDPOINT,
      keys: { p256dh: 'BSmokeKey', auth: 'SmokeAuth' },
    },
  })
  expect(subRes.status()).toBe(201)
}

test('an overdue, absent user is reminded once per overdue episode', async ({
  request,
}) => {
  const today = todayIso()
  await seedEligible(request, today)

  // 09:00 UTC today — the reminder hour, review overdue, user absent: send to the device.
  const first = await tickAt(request, `${today}T09:00:00Z`)
  expect(first.sent).toBe(1)

  // The nudge a Calorie-Tracking User earns.
  expect((await sentPayloads(request)).map((p) => p.body)).toEqual([
    'Open Tucker to log today and refresh your calorie budget.',
  ])

  // Next day, same hour, same episode (still away, no fresh review): deduped — no resend.
  const second = await tickAt(request, `${isoShiftDays(today, 1)}T09:00:00Z`)
  expect(second.sent).toBe(0)
})

test('a weight-only user is reminded about their weight, not about a calorie budget', async ({
  request,
}) => {
  const today = todayIso()

  // The same User in every respect but the one setting — so a nudge is owed on the
  // same terms, and only the words differ.
  await seedEligible(request, today, { tracksCalories: false })

  const tick = await tickAt(request, `${today}T09:00:00Z`)
  expect(tick.sent).toBe(1)

  // Neither half of the shipped copy applies: they log no food, and since ADR 0024
  // their Weekly Review carries no Calorie Budget to refresh.
  expect((await sentPayloads(request)).map((p) => p.body)).toEqual([
    'Open Tucker to log your weight and refresh your trend.',
  ])
})
