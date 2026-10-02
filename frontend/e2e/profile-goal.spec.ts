import { expect, test } from './support/network'
import { bodyAndPlan } from '../test/mocks/handlers/body'
import { baselineProfile } from '../test/mocks/handlers/profile'
import { localTodayIso, pinToLocalMorning } from './support/date'

test('setting a goal on /profile replaces the form with the new goal card', async ({
  page,
  goto,
  network,
}) => {
  // One reading: the live trend stands where it does, at 84.2 kg.
  network.use(
    ...bodyAndPlan({
      profile: baselineProfile,
      readings: [{ id: 1, measuredOn: '2026-05-28', weightKg: 84.2 }],
      today: localTodayIso(),
    }),
  )

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  // No active goal → Maintenance Mode: the creation form is behind the "Start a
  // goal" CTA. Opening it shows the starting trend weight (84.2 kg).
  await goal.getByRole('button', { name: /start a goal/i }).click()
  await expect(goal.getByText(/84\.2 kg/)).toBeVisible()
  await goal.getByLabel(/target weight/i).fill('80')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The section refreshes to show the new active goal as a card, and the form
  // is gone behind the "Set a new goal" affordance.
  await expect(
    goal.getByRole('button', { name: /set a new goal/i }),
  ).toBeVisible()
  await expect(goal.getByText('80.0 kg')).toBeVisible()
  await expect(goal.getByText('0.5 kg/week')).toBeVisible()
  await expect(goal.getByLabel(/target weight/i)).toBeHidden()
})

test('a target at or above the trend is rejected with a field error, no submit', async ({
  page,
  goto,
  network,
}) => {
  // The form validates the target against the trend it fetched (ADR 0016), so a
  // target at/above 84.0 is caught client-side — no request leaves the page.
  network.use(
    ...bodyAndPlan({
      profile: baselineProfile,
      readings: [{ id: 1, measuredOn: '2026-05-28', weightKg: 84.0 }],
    }),
  )

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  await goal.getByRole('button', { name: /start a goal/i }).click()
  await goal.getByLabel(/target weight/i).fill('84.5')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The rejection surfaces as a field error, not a toast, and the form stays put.
  await expect(
    goal.getByText('Target must be below your start weight'),
  ).toBeVisible()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
  await expect(
    goal.getByRole('button', { name: /set a new goal/i }),
  ).toHaveCount(0)
  // A submit that reached the server would be refused in its own words.
  await expect(goal.getByText(/below your current trend weight/i)).toHaveCount(
    0,
  )
})

test('a backend-rejected target keeps the replacement form open and shows the error', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...bodyAndPlan({
      profile: baselineProfile,
      readings: [{ id: 1, measuredOn: '2026-05-28', weightKg: 85.0 }],
      goals: [
        {
          id: 9,
          startedOn: '2026-05-01',
          startWeightKg: 90,
          targetWeightKg: 80,
          rateKgPerWeek: 0.5,
          active: true,
          reachedOn: null,
        },
      ],
    }),
  )

  await goto('/profile', { waitUntil: 'hydration' })

  // The form's fetched trend (85.0) goes stale: a reading logged on another
  // device after it loaded moves the live trend to 84.0 — a tenth of 75 kg on
  // nine tenths of 85. So the client passes a target of 84.5 (< 85.0) that the
  // backend re-derives against and rejects (ADR 0016) — the path that must keep
  // the form open rather than closing it optimistically.
  await page.evaluate(async (clientToday) => {
    await fetch('/api/weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '2026-05-29', weightKg: 75, clientToday }),
    })
  }, localTodayIso())

  const goal = page.getByRole('region', { name: /^goal$/i })

  // The replacement form is behind "Set a new goal" until the user opens it.
  await goal.getByRole('button', { name: /set a new goal/i }).click()
  await goal.getByLabel(/target weight/i).fill('84.5')
  await goal.getByLabel(/rate/i).fill('0.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // The form must not close optimistically on submit — otherwise the backend
  // rejection would have nowhere to render and the user would get no feedback.
  await expect(
    goal.getByText(/below your current trend weight \(84\.0 kg\)/i),
  ).toBeVisible()
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
})

test('a rate the user cannot afford is refused under the rate field, not the target', async ({
  page,
  goto,
  network,
}) => {
  // A 50 kg, 160 cm woman of 40 maintains on ~1595 kcal, while 1.5 kg/week
  // demands 1650 — refused at creation (ADR 0030) while the rate control is
  // still in her hand. Two inputs on this form can each be refused, so the
  // message has to land on the one that is wrong. The clock is pinned because
  // her age, and so her Maintenance, is taken on the day the page sends.
  await pinToLocalMorning(page)
  network.use(
    ...bodyAndPlan({
      profile: {
        ...baselineProfile,
        sex: 'FEMALE',
        birthDate: '1986-05-22',
        heightCm: 160,
      },
      readings: [{ id: 1, measuredOn: '2026-05-28', weightKg: 50.0 }],
    }),
  )

  await goto('/profile', { waitUntil: 'hydration' })

  const goal = page.getByRole('region', { name: /^goal$/i })

  await goal.getByRole('button', { name: /start a goal/i }).click()
  await goal.getByLabel(/target weight/i).fill('45')
  await goal.getByLabel(/rate/i).fill('1.5')
  await goal.getByRole('button', { name: /^set goal$/i }).click()

  // Described by the refusal, so it reads out with the input it is about.
  await expect(goal.getByLabel(/rate/i)).toHaveAccessibleDescription(
    /choose a slower rate/,
  )
  // No rate is suggested: the fastest that would fit leaves a fraction of a
  // calorie, so naming one would be an invented floor arriving as copy.
  await expect(goal.getByText(/1595 kcal a day/)).toBeVisible()
  // And the form stays open, as it must for the refusal to have anywhere to go.
  await expect(goal.getByLabel(/target weight/i)).toBeVisible()
})
