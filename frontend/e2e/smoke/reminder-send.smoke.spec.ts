import type { APIRequestContext } from '@playwright/test'
import { test, expect } from './support/smoke-test'
import { todayIso, isoShiftDays } from '../support/date'

// F6 slice 3 smoke (reminder cron + sender): force an overdue + absent state and
// drive the reminder job. The first tick, at the user's reminder hour, sends a push
// to the subscribed device; a second tick in the same overdue episode is deduped —
// no second nudge (ADR 0010). This proves the wired ReminderPolicy → scheduler →
// subscription-store → dedupe path against the real backend; the web-push transport
// is faked at its boundary by the smoke-profile sender (no real push service exists
// in a smoke, the same reason the enable-reminders smoke stubs PushManager). The
// ticks are driven through a smoke-only endpoint at a pinned instant so the local
// reminder hour is deterministic. Runs at both viewports (Desktop + Mobile Chrome).

const API = 'http://localhost:8080/api'
const REMINDER_HOUR = 9
const DEVICE_ENDPOINT = 'https://push.example/reminder-smoke-device'

interface TickResult {
  sent: number
}

async function seedRemindersOn(request: APIRequestContext) {
  const res = await request.put(`${API}/profile`, {
    data: {
      sex: 'MALE',
      birthDate: '1986-05-22',
      heightCm: 180,
      timezone: 'UTC',
      reminderHour: REMINDER_HOUR,
      remindersEnabled: true,
    },
  })
  expect(res.ok()).toBe(true)
}

async function tickAt(
  request: APIRequestContext,
  atInstant: string,
): Promise<TickResult> {
  const res = await request.post(`${API}/test/reminder-tick`, {
    params: { at: atInstant },
  })
  expect(res.ok()).toBe(true)
  return (await res.json()) as TickResult
}

test('an overdue, absent user is reminded once per overdue episode', async ({
  request,
}) => {
  const today = todayIso()
  const overdueDay = isoShiftDays(today, -8)

  // Reminders on at 09:00 UTC, plus a weight so setup is complete.
  await seedRemindersOn(request)
  expect(
    (
      await request.post(`${API}/weight`, {
        data: { date: today, weightKg: 86 },
      })
    ).ok(),
  ).toBe(true)

  // Read the summary eight days ago: bootstraps a Weekly Review dated then (now a
  // week overdue) and stamps last-seen in the past, so the user is absent today.
  expect(
    (
      await request.get(`${API}/summary`, { params: { date: overdueDay } })
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

  // 09:00 UTC today — the reminder hour, review overdue, user absent: send to the device.
  const first = await tickAt(request, `${today}T09:00:00Z`)
  expect(first.sent).toBe(1)

  // Next day, same hour, same episode (still away, no fresh review): deduped — no resend.
  const second = await tickAt(request, `${isoShiftDays(today, 1)}T09:00:00Z`)
  expect(second.sent).toBe(0)
})
