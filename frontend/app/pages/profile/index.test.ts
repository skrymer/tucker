import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import { bodyAndPlan } from '~~/test/mocks/handlers/body'
import { baselineProfile } from '~~/test/mocks/handlers/profile'
import { failingRead, held, http } from '~~/test/mocks/http'
import { server, useMswServer } from '~~/test/mocks/node'
import { setupWebPush } from '~~/test/web-push-helpers'
import Profile from './index.vue'

useMswServer()

type ProfileDto = components['schemas']['ProfileDto']
type Reading = components['schemas']['WeightMeasurementResponse']

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A User holding [profile] (null for none yet) and [readings], with no Goal. */
const holds = (
  profile: ProfileDto | null,
  readings: Reading[] = [],
  guards: { today?: string; timezone?: string } = {},
) => server.use(...bodyAndPlan({ profile, readings, ...guards }))

const reading: Reading = { id: 1, measuredOn: '2026-05-29', weightKg: 84 }

/** Leave /profile and open it afresh, which reads everything back. */
async function reopen(page: { unmount: () => void }) {
  page.unmount()
  return renderSuspended(Profile)
}

const saveProfile = () => screen.getByRole('button', { name: /save profile/i })

/** Save the details form and wait for the save, and the re-read, to land. */
async function saveDetails() {
  const save = held('put', '/api/profile')
  server.use(save.handler)
  await userEvent.click(saveProfile())
  await save.arrived
  save.release()
  await vi.waitFor(() => expect(saveProfile()).toBeEnabled())
}

describe('/profile progressive disclosure', () => {
  it('disables Weight and Goal with explanatory copy when there is no profile', async () => {
    holds(null)
    await renderSuspended(Profile)

    const weight = screen.getByRole('region', { name: /^weight$/i })
    expect(within(weight).getByText(/set your profile first/i)).toBeVisible()
    expect(
      within(weight).queryByRole('button', { name: /add weight/i }),
    ).toBeNull()

    const goal = screen.getByRole('region', { name: /^goal$/i })
    expect(within(goal).getByText(/log your weight first/i)).toBeVisible()
    expect(within(goal).queryByLabelText(/target weight/i)).toBeNull()
  })

  it('enables Weight but keeps Goal disabled when a profile exists with no weight', async () => {
    holds(baselineProfile)
    await renderSuspended(Profile)

    const weight = screen.getByRole('region', { name: /^weight$/i })
    expect(
      within(weight).getByRole('button', { name: /add weight/i }),
    ).toBeVisible()
    expect(within(weight).queryByText(/set your profile first/i)).toBeNull()

    const goal = screen.getByRole('region', { name: /^goal$/i })
    expect(within(goal).getByText(/log your weight first/i)).toBeVisible()
    expect(within(goal).queryByLabelText(/target weight/i)).toBeNull()
  })

  it('renders the sections in order: Goal, Weight, Your details, Reminder', async () => {
    holds(baselineProfile, [reading])
    await renderSuspended(Profile)

    const goal = screen.getByRole('heading', { name: /^goal$/i })
    const weight = screen.getByRole('heading', { name: /^weight$/i })
    const details = screen.getByRole('heading', { name: /your details/i })
    const reminder = screen.getByRole('heading', {
      name: /weekly-review reminder/i,
    })

    const follows = (before: Element, after: Element) =>
      Boolean(
        before.compareDocumentPosition(after) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      )

    expect(follows(goal, weight)).toBe(true)
    expect(follows(weight, details)).toBe(true)
    expect(follows(details, reminder)).toBe(true)
  })

  it('enables all three sections once a profile and a weight exist', async () => {
    holds(baselineProfile, [reading])
    await renderSuspended(Profile)

    // Profile section is always interactive.
    expect(saveProfile()).toBeVisible()

    const weight = screen.getByRole('region', { name: /^weight$/i })
    expect(
      within(weight).getByRole('button', { name: /add weight/i }),
    ).toBeVisible()
    expect(within(weight).queryByText(/set your profile first/i)).toBeNull()

    // Goal is unlocked: the maintenance status offers re-entry via "Start a
    // goal", no gating copy. (The form itself stays behind that CTA.)
    const goal = screen.getByRole('region', { name: /^goal$/i })
    expect(
      within(goal).getByRole('button', { name: /start a goal/i }),
    ).toBeVisible()
    expect(within(goal).queryByText(/log your weight first/i)).toBeNull()
  })
})

describe('/profile when a section fails to load', () => {
  it('shows a retryable error in place of the Weight section', async () => {
    holds(null)
    server.use(failingRead('/api/weight'))
    await renderSuspended(Profile)

    expect(
      screen.getByRole('heading', { name: "Couldn't load your weight" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: /^weight$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a retryable error in place of the Goal section', async () => {
    holds(null)
    server.use(failingRead('/api/goals'))
    await renderSuspended(Profile)

    expect(
      screen.getByRole('heading', { name: "Couldn't load your goal" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: /^goal$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a retryable error in place of the Goal section when the trend fails to load', async () => {
    holds(null)
    server.use(failingRead('/api/weight/trend'))
    await renderSuspended(Profile)

    expect(
      screen.getByRole('heading', { name: "Couldn't load your goal" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: /^goal$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a retryable error in place of the profile details form', async () => {
    holds(null)
    server.use(failingRead('/api/profile'))
    await renderSuspended(Profile)

    expect(
      screen.getByRole('heading', { name: "Couldn't load your profile" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /save profile/i }),
    ).not.toBeInTheDocument()
  })
})

describe('/profile saving the details form', () => {
  it('keeps the reminder preferences when the details form is saved', async () => {
    // The details form knows nothing about reminders, so it can only preserve
    // them by saving onto the Profile it loaded rather than over it.
    setupWebPush({ supported: true })
    holds(
      {
        ...baselineProfile,
        timezone: 'Australia/Brisbane',
        reminderHour: 21,
        remindersEnabled: true,
        tracksCalories: false,
      },
      [],
      // The zone is shown nowhere, so a save naming another is refused.
      { timezone: 'Australia/Brisbane' },
    )
    const page = await renderSuspended(Profile)

    await saveDetails()

    await reopen(page)
    expect(screen.getByRole('switch', { name: /reminder/i })).toBeChecked()
    expect(screen.getByLabelText(/reminder hour/i)).toHaveValue(21)
    expect(screen.getByRole('radio', { name: /weight only/i })).toBeChecked()
  })

  it('reports the details save as busy while it is in flight', async () => {
    // The slowest mutation in the app: a Calorie Tracking change makes PUT
    // /api/profile re-run the adaptive engine over the whole weight history, so
    // this is the control that most needs to say it is working (ADR 0007).
    const save = held('put', '/api/profile')
    holds(baselineProfile)
    server.use(save.handler)
    await renderSuspended(Profile)
    const user = userEvent.setup()

    expect(saveProfile()).toBeEnabled()
    await user.click(saveProfile())

    await save.arrived
    await vi.waitFor(() => expect(saveProfile()).toBeDisabled())

    // And it hands the control back rather than leaving a dead button behind.
    save.release()
    await vi.waitFor(() => expect(saveProfile()).toBeEnabled())
  })

  it("stamps the save on the user's local day so a Calorie Tracking change lands today", async () => {
    // Toggling Calorie Tracking force-recomputes today's review (ADR 0008's
    // trigger). The client owns "today" (ADR 0014), so the Budget leaves or
    // returns on the user's day rather than the server's wall-clock one.
    holds(baselineProfile, [], { today: localToday() })
    const page = await renderSuspended(Profile)

    await userEvent.click(screen.getByRole('radio', { name: /weight only/i }))
    await saveDetails()

    await reopen(page)
    expect(screen.getByRole('radio', { name: /weight only/i })).toBeChecked()
  })
})

describe('/profile setting a goal', () => {
  it('reports the goal save as busy while it is in flight', async () => {
    // POST /api/goal force-recomputes today's review (ADR 0008), so the form
    // waits on the adaptive engine and has to say so. It also stays on screen
    // until the new active Goal comes back.
    const create = held('post', '/api/goal')
    holds(baselineProfile, [{ id: 1, measuredOn: '2026-05-29', weightKg: 86 }])
    server.use(create.handler)
    await renderSuspended(Profile)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /start a goal/i }))
    await user.type(screen.getByLabelText(/target weight/i), '80')
    await user.type(screen.getByLabelText(/rate/i), '0.5')
    // A number field commits its model on blur, so leave it before submitting.
    await user.tab()

    const setGoal = () => screen.getByRole('button', { name: /set.*goal/i })
    expect(setGoal()).toBeEnabled()
    await user.click(setGoal())

    await create.arrived
    await vi.waitFor(() => expect(setGoal()).toBeDisabled())

    // The new Goal replaces the form, and a fresh one is ready to submit
    // rather than left a dead button behind.
    create.release()
    const newGoal = await screen.findByRole('button', {
      name: /set a new goal/i,
    })
    await user.click(newGoal)
    expect(setGoal()).toBeEnabled()
  })
})

describe('/profile when the backend refuses a goal', () => {
  /** Open the Goal form on a set-up profile whose POST refuses with [refusal]. */
  async function submitGoalRefusedWith(refusal: {
    message: string
    field?: string
  }) {
    holds(baselineProfile, [{ id: 1, measuredOn: '2026-05-29', weightKg: 86 }])
    server.use(
      http.post('/api/goal', ({ response }) => response(400).json(refusal)),
    )
    await renderSuspended(Profile)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /start a goal/i }))
    await user.type(screen.getByLabelText(/target weight/i), '80')
    await user.type(screen.getByLabelText(/rate/i), '0.5')
    // A number field commits its model on blur, so leave it before submitting.
    await user.tab()
    await user.click(screen.getByRole('button', { name: /set.*goal/i }))
  }

  it('puts a refusal on the input it names', async () => {
    await submitGoalRefusedWith({
      message: '1.5 kg a week would leave you nothing to eat',
      field: 'rateKgPerWeek',
    })

    await vi.waitFor(() =>
      expect(screen.getByLabelText(/rate/i)).toHaveAccessibleDescription(
        /nothing to eat/,
      ),
    )
    expect(screen.getByLabelText(/target weight/i)).toHaveAttribute(
      'aria-invalid',
      'false',
    )
  })

  it('puts a refusal that names no field above the submit, on no input', async () => {
    // A skewed client clock and a missing weight are both 400s about neither
    // input. Attributing them to one is what the field mechanism exists to stop.
    await submitGoalRefusedWith({
      message:
        'clientToday 2026-09-19 is implausible relative to the server date',
    })

    await vi.waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/implausible/),
    )
    for (const name of [/target weight/i, /rate/i]) {
      expect(screen.getByLabelText(name)).toHaveAttribute(
        'aria-invalid',
        'false',
      )
    }
  })
})

describe('/profile logging a weight', () => {
  it('keeps the weight sheet up, reporting busy, until the save lands', async () => {
    // The sheet is the confirmation: dismissing it optimistically claims a
    // reading is stored before the server has said so (ADR 0007).
    const save = held('post', '/api/weight')
    holds(baselineProfile)
    server.use(save.handler)
    await renderSuspended(Profile)
    const user = userEvent.setup()

    const weight = screen.getByRole('region', { name: /^weight$/i })
    await user.click(
      within(weight).getByRole('button', { name: /add weight/i }),
    )
    await user.type(screen.getByLabelText(/weight \(kg\)/i), '84.2')
    // A number field commits its model on blur, so leave it before submitting.
    await user.tab()

    const saveWeight = () =>
      screen.getByRole('button', { name: /save weight/i })
    expect(saveWeight()).toBeEnabled()
    await user.click(saveWeight())

    await save.arrived
    await vi.waitFor(() => expect(saveWeight()).toBeDisabled())

    save.release()
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /log weight/i })).toBeNull(),
    )
  })
})
