import { describe, expect, it, vi } from 'vitest'
import { renderSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { createError, getQuery, readBody } from 'h3'
import { openGate } from '~~/test/async-gate'
import Profile from './index.vue'

type ProfileBody = {
  sex: string
  birthDate: string
  heightCm: number
  timezone?: string
  reminderHour?: number
  remindersEnabled?: boolean
  tracksCalories?: boolean
}
type Weight = { id: number; measuredOn: string; weightKg: number }
type Goal = unknown

// Wire up the three upstream GETs the page fetches on load. Each test sets the
// fixtures that put gating into the state under test.
function mockApi(opts: {
  profile: ProfileBody | null
  weights: Weight[]
  goals: Goal[]
}) {
  registerEndpoint('/api/profile', () => {
    if (opts.profile === null) throw createError({ statusCode: 404 })
    return opts.profile
  })
  registerEndpoint('/api/weight', () => opts.weights)
  registerEndpoint('/api/goals', () => opts.goals)
}

describe('/profile progressive disclosure', () => {
  it('disables Weight and Goal with explanatory copy when there is no profile', async () => {
    mockApi({ profile: null, weights: [], goals: [] })
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
    mockApi({
      profile: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
      weights: [],
      goals: [],
    })
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
    mockApi({
      profile: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
      weights: [{ id: 1, measuredOn: '2026-05-29', weightKg: 84 }],
      goals: [],
    })
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
    mockApi({
      profile: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
      weights: [{ id: 1, measuredOn: '2026-05-29', weightKg: 84 }],
      goals: [],
    })
    await renderSuspended(Profile)

    // Profile section is always interactive.
    expect(screen.getByRole('button', { name: /save profile/i })).toBeVisible()

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
    registerEndpoint('/api/profile', () => {
      throw createError({ statusCode: 404 })
    })
    registerEndpoint('/api/weight', () => {
      throw createError({ statusCode: 500 })
    })
    registerEndpoint('/api/goals', () => [])
    await renderSuspended(Profile)

    expect(
      screen.getByRole('heading', { name: "Couldn't load your weight" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: /^weight$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a retryable error in place of the Goal section', async () => {
    registerEndpoint('/api/profile', () => {
      throw createError({ statusCode: 404 })
    })
    registerEndpoint('/api/weight', () => [])
    registerEndpoint('/api/goals', () => {
      throw createError({ statusCode: 500 })
    })
    await renderSuspended(Profile)

    expect(
      screen.getByRole('heading', { name: "Couldn't load your goal" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: /^goal$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a retryable error in place of the Goal section when the trend fails to load', async () => {
    registerEndpoint('/api/profile', () => {
      throw createError({ statusCode: 404 })
    })
    registerEndpoint('/api/weight', () => [])
    registerEndpoint('/api/goals', () => [])
    registerEndpoint('/api/weight/trend', () => {
      throw createError({ statusCode: 500 })
    })
    await renderSuspended(Profile)

    expect(
      screen.getByRole('heading', { name: "Couldn't load your goal" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('region', { name: /^goal$/i }),
    ).not.toBeInTheDocument()
  })

  it('shows a retryable error in place of the profile details form', async () => {
    registerEndpoint('/api/profile', () => {
      throw createError({ statusCode: 500 })
    })
    registerEndpoint('/api/weight', () => [])
    registerEndpoint('/api/goals', () => [])
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
    let saved: Record<string, unknown> | undefined
    mockApi({
      profile: {
        sex: 'MALE',
        birthDate: '1990-06-15',
        heightCm: 180,
        timezone: 'Australia/Brisbane',
        reminderHour: 21,
        remindersEnabled: true,
        tracksCalories: false,
      },
      weights: [],
      goals: [],
    })
    registerEndpoint('/api/profile', {
      method: 'PUT',
      handler: async (event) => {
        saved = await readBody(event)
        return saved
      },
    })
    await renderSuspended(Profile)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    await vi.waitFor(() => expect(saved).toBeDefined())
    expect(saved).toMatchObject({
      timezone: 'Australia/Brisbane',
      reminderHour: 21,
      remindersEnabled: true,
      tracksCalories: false,
    })
  })

  it('reports the details save as busy while it is in flight', async () => {
    // The slowest mutation in the app: a Calorie Tracking change makes PUT
    // /api/profile re-run the adaptive engine over the whole weight history, so
    // this is the control that most needs to say it is working (ADR 0007).
    const { gate, release } = openGate()
    mockApi({
      profile: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
      weights: [],
      goals: [],
    })
    registerEndpoint('/api/profile', {
      method: 'PUT',
      handler: async () => {
        await gate
        return {}
      },
    })
    await renderSuspended(Profile)
    const user = userEvent.setup()
    const save = () => screen.getByRole('button', { name: /save profile/i })

    expect(save()).toBeEnabled()
    await user.click(save())

    await vi.waitFor(() => expect(save()).toBeDisabled())

    // And it hands the control back rather than leaving a dead button behind.
    release()
    await vi.waitFor(() => expect(save()).toBeEnabled())
  })

  it("stamps the save on the user's local day so a Calorie Tracking change lands today", async () => {
    // Toggling Calorie Tracking force-recomputes today's review (ADR 0008's
    // trigger). The client owns "today" (ADR 0014), so the Budget leaves or
    // returns on the user's day rather than the server's wall-clock one.
    let query: Record<string, unknown> | undefined
    mockApi({
      profile: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
      weights: [],
      goals: [],
    })
    registerEndpoint('/api/profile', {
      method: 'PUT',
      handler: (event) => {
        query = getQuery(event)
        return {}
      },
    })
    await renderSuspended(Profile)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    await vi.waitFor(() => expect(query).toBeDefined())
    expect(query?.clientToday).toBe(localToday())
  })
})

describe('/profile setting a goal', () => {
  it('reports the goal save as busy while it is in flight', async () => {
    // POST /api/goal force-recomputes today's review (ADR 0008), so the form
    // waits on the adaptive engine and has to say so. It also stays on screen
    // afterwards — it closes only once a new active Goal comes back.
    const { gate, release } = openGate()
    mockApi({
      profile: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
      weights: [{ id: 1, measuredOn: '2026-05-29', weightKg: 86 }],
      goals: [],
    })
    registerEndpoint('/api/weight/trend', () => ({
      trendKg: 86,
      asOf: '2026-05-29',
    }))
    registerEndpoint('/api/goal', {
      method: 'POST',
      handler: async () => {
        await gate
        return {}
      },
    })
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

    await vi.waitFor(() => expect(setGoal()).toBeDisabled())

    // And it hands the control back rather than leaving a dead button behind.
    release()
    await vi.waitFor(() => expect(setGoal()).toBeEnabled())
  })
})

describe('/profile logging a weight', () => {
  it('keeps the weight sheet up, reporting busy, until the save lands', async () => {
    // The sheet is the confirmation: dismissing it optimistically claims a
    // reading is stored before the server has said so (ADR 0007).
    const { gate, release } = openGate()
    mockApi({
      profile: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
      weights: [],
      goals: [],
    })
    // Stated rather than inherited: an earlier test's handler would otherwise
    // be what this one resolves the trend against.
    registerEndpoint('/api/weight/trend', () => ({
      trendKg: 84,
      asOf: '2026-05-29',
    }))
    registerEndpoint('/api/weight', {
      method: 'POST',
      handler: async () => {
        await gate
        return {}
      },
    })
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

    await vi.waitFor(() => expect(saveWeight()).toBeDisabled())

    release()
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /log weight/i })).toBeNull(),
    )
  })
})
