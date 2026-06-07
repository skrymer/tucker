import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { useWebPush } from './useWebPush'
import {
  fakePushSubscription,
  setTimezone,
  setupWebPush,
} from '../../test/web-push-helpers'
import { setStandalone, setUserAgent, UA } from '../../test/pwa-install-helpers'

// The true external boundaries are the browser's push machinery (stubbed via
// setupWebPush) and the network. The VAPID key + subscribe/unsubscribe calls go
// over `$api`, mocked here with registerEndpoint (ADR 0013).
let postedSubscription: Record<string, unknown> | undefined
let deletedSubscription: Record<string, unknown> | undefined
registerEndpoint('/api/push/vapid-public-key', () => ({
  // A valid base64url so the urlBase64ToUint8Array conversion doesn't throw.
  publicKey:
    'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
}))
registerEndpoint('/api/push/subscriptions', {
  method: 'POST',
  handler: async (event) => {
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
  postedSubscription = undefined
  deletedSubscription = undefined
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
    const env = setupWebPush({
      supported: true,
      permission: 'granted',
      created: fakePushSubscription('https://push.example/new-device'),
    })
    await renderSuspended(Harness)

    await userEvent.click(screen.getByRole('button', { name: 'enable' }))

    await vi.waitFor(() => expect(postedSubscription).toBeDefined())
    expect(env.requestPermission).toHaveBeenCalledOnce()
    expect(env.subscribe).toHaveBeenCalledOnce()
    expect(postedSubscription).toMatchObject({
      endpoint: 'https://push.example/new-device',
      keys: { p256dh: 'BDeviceKey', auth: 'AuthSecret' },
      label: 'Pixel 7',
    })
    await vi.waitFor(() => expect(text('subscribed')).toBe('true'))
  })

  it('does not subscribe when notification permission is denied', async () => {
    const env = setupWebPush({ supported: true, permission: 'denied' })
    await renderSuspended(Harness)

    await userEvent.click(screen.getByRole('button', { name: 'enable' }))

    // Permission was asked once (from the gesture) but nothing was subscribed.
    expect(env.requestPermission).toHaveBeenCalledOnce()
    expect(env.subscribe).not.toHaveBeenCalled()
    expect(postedSubscription).toBeUndefined()
    expect(text('subscribed')).toBe('false')
  })

  it('disable() unsubscribes the device and forgets its stored subscription', async () => {
    const existing = fakePushSubscription('https://push.example/device-a')
    setupWebPush({ supported: true, existing })
    await renderSuspended(Harness)
    await vi.waitFor(() => expect(text('subscribed')).toBe('true'))

    await userEvent.click(screen.getByRole('button', { name: 'disable' }))

    await vi.waitFor(() => expect(deletedSubscription).toBeDefined())
    expect(existing.unsubscribe).toHaveBeenCalledOnce()
    expect(deletedSubscription).toEqual({
      endpoint: 'https://push.example/device-a',
    })
    await vi.waitFor(() => expect(text('subscribed')).toBe('false'))
  })

  it('captures the browser IANA timezone, which the settings control saves on the Profile', async () => {
    setupWebPush({ supported: true })
    setTimezone('Europe/Copenhagen')
    await renderSuspended(Harness)

    expect(text('timezone')).toBe('Europe/Copenhagen')
  })
})
