import { vi } from 'vitest'

// Shared browser-boundary stubs for the web-push tests (useWebPush and the
// ReminderSettings component that composes it). The *true external boundary*
// here is the browser's push machinery — the service worker registration's
// PushManager, the Notification permission prompt, and the IANA timezone the
// browser reports (ADR 0013) — so both tests drive the same fakes rather than
// each redefining them. The network (`$api`) is mocked separately via
// `registerEndpoint`.

/** A fake browser PushSubscription, in the shape useWebPush reads. */
export function fakePushSubscription(
  endpoint = 'https://push.example/device-a',
) {
  return {
    endpoint,
    toJSON: () => ({
      endpoint,
      keys: { p256dh: 'BDeviceKey', auth: 'AuthSecret' },
    }),
    unsubscribe: vi.fn(async () => true),
  }
}

export interface WebPushEnv {
  subscribe: ReturnType<typeof vi.fn>
  getSubscription: ReturnType<typeof vi.fn>
  requestPermission: ReturnType<typeof vi.fn>
}

interface WebPushOptions {
  /** Whether the browser exposes serviceWorker + PushManager + Notification. */
  supported?: boolean
  /** What Notification.requestPermission() resolves to. */
  permission?: NotificationPermission
  /** An existing subscription this device already holds (or null). */
  existing?: ReturnType<typeof fakePushSubscription> | null
  /** The subscription PushManager.subscribe() returns. */
  created?: ReturnType<typeof fakePushSubscription>
}

/**
 * Install fake push machinery on the global browser objects. Returns the spies
 * so a test can assert subscribe/unsubscribe/permission were driven.
 */
export function setupWebPush(options: WebPushOptions = {}): WebPushEnv {
  const {
    supported = true,
    permission = 'granted',
    existing = null,
    created = fakePushSubscription(),
  } = options

  const subscribe = vi.fn(async () => created)
  const getSubscription = vi.fn(async () => existing)
  const requestPermission = vi.fn(async () => permission)

  if (supported) {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }),
      },
    })
    vi.stubGlobal('PushManager', class FakePushManager {})
    vi.stubGlobal('Notification', { requestPermission, permission })
  } else {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: undefined,
    })
    vi.stubGlobal('PushManager', undefined)
    vi.stubGlobal('Notification', undefined)
  }

  return { subscribe, getSubscription, requestPermission }
}

/** Stub the browser's reported IANA timezone. */
export function setTimezone(zone: string) {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: zone }),
  } as unknown as Intl.DateTimeFormat)
}
