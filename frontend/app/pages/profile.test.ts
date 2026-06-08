import { describe, expect, it } from 'vitest'
import { renderSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import { createError } from 'h3'
import Profile from './profile.vue'

type ProfileBody = { sex: string; birthDate: string; heightCm: number }
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

    const weight = screen.getByRole('region', { name: /weight log/i })
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

    const weight = screen.getByRole('region', { name: /weight log/i })
    expect(
      within(weight).getByRole('button', { name: /add weight/i }),
    ).toBeVisible()
    expect(within(weight).queryByText(/set your profile first/i)).toBeNull()

    const goal = screen.getByRole('region', { name: /^goal$/i })
    expect(within(goal).getByText(/log your weight first/i)).toBeVisible()
    expect(within(goal).queryByLabelText(/target weight/i)).toBeNull()
  })

  it('places the Goal and Reminder controls above the weight log', async () => {
    mockApi({
      profile: { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 },
      weights: [{ id: 1, measuredOn: '2026-05-29', weightKg: 84 }],
      goals: [],
    })
    await renderSuspended(Profile)

    const goal = screen.getByRole('heading', { name: /^goal$/i })
    const reminder = screen.getByRole('heading', {
      name: /weekly-review reminder/i,
    })
    const weightLog = screen.getByRole('heading', { name: /weight log/i })

    const follows = (before: Element, after: Element) =>
      Boolean(
        before.compareDocumentPosition(after) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      )

    expect(follows(goal, weightLog)).toBe(true)
    expect(follows(reminder, weightLog)).toBe(true)
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

    const weight = screen.getByRole('region', { name: /weight log/i })
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
