import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { pushServiceFor } from '~~/test/mocks/handlers/push'
import { server, useMswServer } from '~~/test/mocks/node'
import { useWebPush } from './useWebPush'
import {
  fakePushSubscription,
  setTimezone,
  setupWebPush,
} from '../../test/web-push-helpers'
import { setStandalone, setUserAgent, UA } from '../../test/pwa-install-helpers'

useMswServer()

// The true external boundaries are the browser's push machinery (stubbed via
// setupWebPush) and the network, answered by the shared MSW handlers
// (ADR 0013, ADR 0034).

// Surface the composable's reactive state into the DOM and drive enable()/
// disable() through buttons, the way the ReminderSettings component would.
const Harness = defineComponent({
  setup() {
    const push = useWebPush()
    return {
      ...push,
      doEnable: () => push.enable('Pixel 7'),
      doDisable: () => push.disable(),
    }
  },
  template: `
    <div>
      <span data-testid="supported">{{ isSupported }}</span>
      <span data-testid="subscribed">{{ isSubscribed }}</span>
      <span data-testid="requires-install">{{ requiresInstall }}</span>
      <span data-testid="timezone">{{ timezone }}</span>
      <button @click="doEnable">enable</button>
      <button @click="doDisable">disable</button>
    </div>
  `,
})

const text = (id: string) => screen.getByTestId(id).textContent

beforeEach(() => {
  setUserAgent(UA.desktop, { maxTouchPoints: 0, standalone: undefined })
  setStandalone(false)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useWebPush', () => {
  it('reports push supported when the service worker, PushManager and Notification all exist', async () => {
    setupWebPush({ supported: true })
    await renderSuspended(Harness)

    expect(text('supported')).toBe('true')
  })

  it('requires installing to the home screen first on iOS, where push needs an installed app', async () => {
    setupWebPush({ supported: true })
    setUserAgent(UA.ios)
    setStandalone(false)
    await renderSuspended(Harness)

    expect(text('requires-install')).toBe('true')
  })

  it('does not require installing on iOS once running from the home screen', async () => {
    setupWebPush({ supported: true })
    setUserAgent(UA.ios)
    setStandalone(true)
    await renderSuspended(Harness)

    expect(text('requires-install')).toBe('false')
  })

  it('reports the device as subscribed when it already holds a push subscription', async () => {
    setupWebPush({ supported: true, existing: fakePushSubscription() })
    await renderSuspended(Harness)

    await vi.waitFor(() => expect(text('subscribed')).toBe('true'))
  })

  it('reports the device as not subscribed when it holds no push subscription', async () => {
    setupWebPush({ supported: true, existing: null })
    await renderSuspended(Harness)

    expect(text('subscribed')).toBe('false')
  })

  it('enable() requests permission, subscribes via PushManager, and stores the subscription', async () => {
    const created = fakePushSubscription('https://push.example/new-device')
    const env = setupWebPush({
      supported: true,
      permission: 'granted',
      created,
    })
    server.use(...pushServiceFor({ ...created.toJSON(), label: 'Pixel 7' }))
    await renderSuspended(Harness)

    await userEvent.click(screen.getByRole('button', { name: 'enable' }))

    // Subscribed only once the server has stored this device's subscription.
    await vi.waitFor(() => expect(text('subscribed')).toBe('true'))
    expect(env.requestPermission).toHaveBeenCalledOnce()
    expect(env.subscribe).toHaveBeenCalledOnce()
  })

  it('does not subscribe when notification permission is denied', async () => {
    // No push service is stubbed, so a subscription sent anyway fails the test.
    const env = setupWebPush({ supported: true, permission: 'denied' })
    await renderSuspended(Harness)

    await userEvent.click(screen.getByRole('button', { name: 'enable' }))

    // Permission was asked once (from the gesture) but nothing was subscribed.
    expect(env.requestPermission).toHaveBeenCalledOnce()
    expect(env.subscribe).not.toHaveBeenCalled()
    expect(text('subscribed')).toBe('false')
  })

  it('disable() unsubscribes the device and forgets its stored subscription', async () => {
    const existing = fakePushSubscription('https://push.example/device-a')
    setupWebPush({ supported: true, existing })
    server.use(...pushServiceFor(existing.toJSON()))
    await renderSuspended(Harness)
    await vi.waitFor(() => expect(text('subscribed')).toBe('true'))

    await userEvent.click(screen.getByRole('button', { name: 'disable' }))

    // Not subscribed only once the server has forgotten this device.
    await vi.waitFor(() => expect(text('subscribed')).toBe('false'))
    expect(existing.unsubscribe).toHaveBeenCalledOnce()
  })

  it('captures the browser IANA timezone, which the settings control saves on the Profile', async () => {
    setupWebPush({ supported: true })
    setTimezone('Europe/Copenhagen')
    await renderSuspended(Harness)

    expect(text('timezone')).toBe('Europe/Copenhagen')
  })
})
