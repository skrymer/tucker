import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import type { components } from '#open-fetch-schemas/api'
import { baselineProfile, savedProfile } from '~~/test/mocks/handlers/profile'
import { pushServiceFor } from '~~/test/mocks/handlers/push'
import { http, serverError } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { reopenProfile } from '~~/test/profile-page'
import ReminderSettings from './ReminderSettings.vue'
import {
  fakePushSubscription,
  setTimezone,
  setupWebPush,
} from '../../test/web-push-helpers'
import { setStandalone, setUserAgent, UA } from '../../test/pwa-install-helpers'

// ReminderSettings composes the *real* useWebPush; the only things mocked are
// the true external boundaries — the browser push machinery (setupWebPush) and
// the network (the shared MSW handlers) — never the composable itself
// (ADR 0013, ADR 0034).

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({ add: toastAdd, remove: vi.fn() }))

type ProfileDto = components['schemas']['ProfileDto']

const profile: ProfileDto = {
  ...baselineProfile,
  timezone: 'UTC',
  reminderHour: 9,
}

const thisDevice = fakePushSubscription('https://push.example/this-device')

const render = (over: Partial<ProfileDto> = {}, onSaved = () => {}) =>
  renderSuspended(ReminderSettings, {
    props: { profile: { ...profile, ...over }, onSaved },
  })

const reminderSwitch = () => screen.getByRole('switch', { name: /reminder/i })

beforeEach(() => {
  toastAdd.mockClear()
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
    const env = setupWebPush({ supported: true, created: thisDevice })
    server.use(
      ...pushServiceFor({ ...thisDevice.toJSON(), label: UA.desktop }),
      // The zone is shown nowhere, so a save naming another is refused.
      ...savedProfile(profile, { timezone: 'Europe/Copenhagen' }).handlers,
    )
    const settings = await render({ reminderHour: 9, remindersEnabled: false })

    await userEvent.click(reminderSwitch())

    await vi.waitFor(() => expect(reminderSwitch()).toBeChecked())
    expect(env.requestPermission).toHaveBeenCalledOnce()

    await reopenProfile(settings)
    expect(reminderSwitch()).toBeChecked()
    expect(screen.getByLabelText(/reminder hour/i)).toHaveValue(9)
    expect(screen.getByRole('radio', { name: /^male$/i })).toBeChecked()
  })

  it('sends the local day with the reminder write, which replaces the whole Profile', async () => {
    // The write carries the stored birth date back, and the backend judges it
    // against "today" — so a caller that omits the client's day leaves the
    // server's clock to decide, which differs for the width of a UTC offset.
    setupWebPush({ supported: true, created: thisDevice })
    server.use(
      ...pushServiceFor({ ...thisDevice.toJSON(), label: UA.desktop }),
      ...savedProfile(profile, { today: localToday() }).handlers,
    )
    await render({ reminderHour: 9, remindersEnabled: false })

    await userEvent.click(reminderSwitch())

    // The switch turns on only once the whole Profile write has landed.
    await vi.waitFor(() => expect(reminderSwitch()).toBeChecked())
  })

  it('turning the toggle off unsubscribes the device and saves reminders as off', async () => {
    setupWebPush({ supported: true, existing: thisDevice })
    server.use(
      ...pushServiceFor(thisDevice.toJSON()),
      ...savedProfile({ ...profile, remindersEnabled: true }).handlers,
    )
    const settings = await render({ remindersEnabled: true })

    await userEvent.click(reminderSwitch())

    await vi.waitFor(() => expect(reminderSwitch()).not.toBeChecked())
    expect(thisDevice.unsubscribe).toHaveBeenCalledOnce()

    await reopenProfile(settings)
    expect(reminderSwitch()).not.toBeChecked()
  })

  it('leaves the toggle off and saves nothing when subscribing fails', async () => {
    setupWebPush({ supported: true, created: thisDevice })
    server.use(
      http.post('/api/push/subscriptions', ({ response }) =>
        response.untyped(serverError()),
      ),
      ...savedProfile(profile).handlers,
    )
    const settings = await render({ remindersEnabled: false })

    await userEvent.click(reminderSwitch())

    // The subscription POST failed, so the opt-in is never saved and the switch
    // reflects reality instead of being stranded on; the retry toast — from the
    // shared mutation — tells the user (ADR 0005).
    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not update reminders' }),
      ),
    )
    expect(reminderSwitch()).not.toBeChecked()

    await reopenProfile(settings)
    expect(reminderSwitch()).not.toBeChecked()
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
    server.use(...savedProfile(profile).handlers)
    const settings = await render({ reminderHour: 9 })

    const hour = screen.getByLabelText(/reminder hour/i)
    await userEvent.clear(hour)
    await userEvent.type(hour, '24')
    await userEvent.click(
      screen.getByRole('button', { name: /save reminder time/i }),
    )

    expect(screen.getByText(/between 0 and 23/i)).toBeVisible()

    // A save sent anyway would be refused in the server's own words.
    await reopenProfile(settings)
    expect(screen.getByLabelText(/reminder hour/i)).toHaveValue(9)
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('saves a valid reminder hour onto the profile without clobbering the rest', async () => {
    setupWebPush({ supported: true })
    server.use(...savedProfile({ ...profile, tracksCalories: false }).handlers)
    const saved = vi.fn()
    const settings = await render(
      { reminderHour: 9, tracksCalories: false },
      saved,
    )

    const hour = screen.getByLabelText(/reminder hour/i)
    await userEvent.clear(hour)
    await userEvent.type(hour, '7')
    await userEvent.click(
      screen.getByRole('button', { name: /save reminder time/i }),
    )
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce())

    await reopenProfile(settings)
    expect(screen.getByLabelText(/reminder hour/i)).toHaveValue(7)
    expect(screen.getByRole('radio', { name: /^male$/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /weight only/i })).toBeChecked()
  })

  it('never asks for notification permission on load — only from a gesture', async () => {
    const env = setupWebPush({ supported: true })
    await render()

    await within(document.body).findByRole('switch')
    expect(env.requestPermission).not.toHaveBeenCalled()
  })
})
