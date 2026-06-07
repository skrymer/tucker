import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import ReminderSettings from './ReminderSettings.vue'
import {
  fakePushSubscription,
  setTimezone,
  setupWebPush,
} from '../../test/web-push-helpers'
import { setStandalone, setUserAgent, UA } from '../../test/pwa-install-helpers'

// ReminderSettings composes the *real* useWebPush; the only things mocked are
// the true external boundaries — the browser push machinery (setupWebPush) and
// the network (registerEndpoint) — never the composable itself (ADR 0013).
let savedProfile: Record<string, unknown> | undefined
let postedSubscription: Record<string, unknown> | undefined
let deletedSubscription: Record<string, unknown> | undefined
let failSubscriptionPost = false
registerEndpoint('/api/push/vapid-public-key', () => ({
  publicKey:
    'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
}))
registerEndpoint('/api/push/subscriptions', {
  method: 'POST',
  handler: async (event) => {
    if (failSubscriptionPost) throw createError({ statusCode: 500 })
    postedSubscription = await readBody(event)
    return {}
  },
})
registerEndpoint('/api/push/subscriptions', {
  method: 'DELETE',
  handler: async (event) => {
    deletedSubscription = await readBody(event)
    return {}
  },
})
registerEndpoint('/api/profile', {
  method: 'PUT',
  handler: async (event) => {
    savedProfile = await readBody(event)
    return savedProfile
  },
})

const profile: components['schemas']['ProfileDto'] = {
  sex: 'MALE',
  birthDate: '1986-05-22',
  heightCm: 180,
  timezone: 'UTC',
  reminderHour: 9,
  remindersEnabled: false,
}

const render = (over: Partial<typeof profile> = {}) =>
  renderSuspended(ReminderSettings, {
    props: { profile: { ...profile, ...over } },
  })

beforeEach(() => {
  savedProfile = undefined
  postedSubscription = undefined
  deletedSubscription = undefined
  failSubscriptionPost = false
  setUserAgent(UA.desktop, { maxTouchPoints: 0, standalone: undefined })
  setStandalone(false)
  setTimezone('Europe/Copenhagen')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ReminderSettings', () => {
  it('turning the toggle on subscribes the device and saves the reminder preferences', async () => {
    const env = setupWebPush({
      supported: true,
      created: fakePushSubscription('https://push.example/this-device'),
    })
    await render({ reminderHour: 9, remindersEnabled: false })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await vi.waitFor(() => expect(savedProfile).toBeDefined())
    expect(env.requestPermission).toHaveBeenCalledOnce()
    expect(postedSubscription).toMatchObject({
      endpoint: 'https://push.example/this-device',
    })
    expect(savedProfile).toMatchObject({
      sex: 'MALE',
      remindersEnabled: true,
      reminderHour: 9,
      timezone: 'Europe/Copenhagen',
    })
  })

  it('turning the toggle off unsubscribes the device and saves reminders as off', async () => {
    setupWebPush({
      supported: true,
      existing: fakePushSubscription('https://push.example/this-device'),
    })
    await render({ remindersEnabled: true })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    await vi.waitFor(() => expect(deletedSubscription).toBeDefined())
    expect(deletedSubscription).toEqual({
      endpoint: 'https://push.example/this-device',
    })
    expect(savedProfile).toMatchObject({ remindersEnabled: false })
  })

  it('leaves the toggle off and saves nothing when subscribing fails', async () => {
    failSubscriptionPost = true
    setupWebPush({ supported: true })
    await render({ remindersEnabled: false })

    await userEvent.click(screen.getByRole('switch', { name: /reminder/i }))

    // The subscription POST failed, so the opt-in is never saved and the switch
    // reflects reality instead of being stranded on (the retry toast — from the
    // shared mutation — tells the user, per ADR 0005).
    await vi.waitFor(() =>
      expect(
        screen.getByRole('switch', { name: /reminder/i }),
      ).not.toBeChecked(),
    )
    expect(savedProfile).toBeUndefined()
  })

  it('on iOS before install, shows the add-to-home-screen hint instead of a toggle', async () => {
    setupWebPush({ supported: true })
    setUserAgent(UA.ios)
    setStandalone(false)
    await render()

    expect(screen.getByText(/add tucker to your home screen/i)).toBeVisible()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('shows an unsupported message instead of a toggle when the browser can not do web push', async () => {
    setupWebPush({ supported: false })
    await render()

    expect(screen.getByText(/reminders aren.t supported/i)).toBeVisible()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('rejects a reminder hour outside 0–23 and does not save it', async () => {
    setupWebPush({ supported: true })
    await render({ reminderHour: 9 })

    const hour = screen.getByLabelText(/reminder hour/i)
    await userEvent.clear(hour)
    await userEvent.type(hour, '24')
    await userEvent.click(
      screen.getByRole('button', { name: /save reminder time/i }),
    )

    expect(screen.getByText(/between 0 and 23/i)).toBeVisible()
    expect(savedProfile).toBeUndefined()
  })

  it('saves a valid reminder hour onto the profile', async () => {
    setupWebPush({ supported: true })
    await render({ reminderHour: 9 })

    const hour = screen.getByLabelText(/reminder hour/i)
    await userEvent.clear(hour)
    await userEvent.type(hour, '7')
    await userEvent.click(
      screen.getByRole('button', { name: /save reminder time/i }),
    )

    await vi.waitFor(() => expect(savedProfile).toBeDefined())
    expect(savedProfile).toMatchObject({ reminderHour: 7, sex: 'MALE' })
  })

  it('never asks for notification permission on load — only from a gesture', async () => {
    const env = setupWebPush({ supported: true })
    await render()

    await within(document.body).findByRole('switch')
    expect(env.requestPermission).not.toHaveBeenCalled()
  })
})
