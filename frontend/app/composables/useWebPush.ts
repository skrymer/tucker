import type { Ref } from 'vue'

/**
 * The device's Weekly-Review Reminder subscription, as a deep composable: it
 * owns the browser push machinery (permission, the service worker's PushManager)
 * and the Push Subscription transport (POST/DELETE), exposing a small intent
 * surface — `enable()` / `disable()` — plus the state the settings control
 * branches on. The user's reminder *preferences* (timezone, hour, on/off) live
 * on the Profile and are saved by the control, not here (CONTEXT.md).
 */
export function useWebPush() {
  const { isSupported, requiresInstall } = useWebPushSupport()
  // The user's local zone, defaulted from the browser — the settings control
  // saves it on the Profile when enabling reminders (CONTEXT.md Profile).
  const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const { isSubscribed, enable, disable } = usePushSubscription(isSupported)
  return {
    isSupported,
    isSubscribed,
    requiresInstall,
    timezone,
    enable,
    disable,
  }
}

/** This device's Push Subscription: whether it has one, and taking one out or back. */
function usePushSubscription(isSupported: Readonly<Ref<boolean>>) {
  const { $api } = useNuxtApp()
  const isSubscribed = ref(false)

  onMounted(async () => {
    if (!isSupported.value) return
    isSubscribed.value = (await currentSubscription()) !== null
  })

  /**
   * Turn on reminders for this device, driven from a user gesture (the toggle):
   * ask for notification permission — the *only* place Tucker prompts — then
   * subscribe through the service worker and store the Push Subscription.
   */
  async function enable(label?: string) {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
    const { publicKey } = await $api('/api/push/vapid-public-key')
    const subscription = await subscribeThisDevice(publicKey)
    await $api('/api/push/subscriptions', {
      method: 'POST',
      body: subscriptionBody(subscription, label),
    })
    isSubscribed.value = true
  }

  /** Turn off reminders for this device: unsubscribe the browser and forget the row. */
  async function disable() {
    const endpoint = await unsubscribeThisDevice()
    if (endpoint) {
      await $api('/api/push/subscriptions', {
        method: 'DELETE',
        body: { endpoint },
      })
    }
    isSubscribed.value = false
  }

  return { isSubscribed, enable, disable }
}

/** Whether this browser can take push at all, and whether it must be installed first. */
function useWebPushSupport() {
  const isSupported = computed(
    () =>
      Boolean(navigator.serviceWorker) &&
      typeof PushManager !== 'undefined' &&
      typeof Notification !== 'undefined',
  )
  // iOS is the only platform that gates push on being installed to the home
  // screen (ADR 0011); reuse the install composable's platform/installed signal.
  const { platform, isInstalled } = usePwaInstall()
  const requiresInstall = computed(
    () => platform === 'ios' && !isInstalled.value,
  )
  return { isSupported, requiresInstall }
}

async function currentSubscription() {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

/** Unsubscribes the browser; the endpoint it had, or null when it had none. */
async function unsubscribeThisDevice() {
  const subscription = await currentSubscription()
  if (!subscription) return null
  await subscription.unsubscribe()
  return subscription.endpoint
}

async function subscribeThisDevice(publicKey: string) {
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })
}

/**
 * The Push Subscription as the backend stores it. `toJSON()` marks every field
 * optional (it is the spec's dictionary shape), while the backend requires the
 * endpoint and both keys. The endpoint comes from the subscription itself, where
 * it is non-optional, and the keys are checked rather than posting a row that
 * could never be encrypted to. A subscription created with `userVisibleOnly` and
 * an application server key always carries both, so this throws only if that
 * invariant breaks — and it throws into the same persistent retry toast a
 * rejected POST would (ADR 0005).
 */
function subscriptionBody(subscription: PushSubscription, label?: string) {
  const { keys } = subscription.toJSON()
  if (!keys?.p256dh || !keys.auth) {
    throw new Error('Push subscription is missing its encryption keys')
  }
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
    label,
  }
}

/**
 * Decode the base64url VAPID key into the byte array PushManager requires.
 *
 * The `<ArrayBuffer>` argument is load-bearing: bare `Uint8Array` defaults to
 * `Uint8Array<ArrayBufferLike>`, which admits a `SharedArrayBuffer` and so is
 * not assignable to `applicationServerKey`'s `BufferSource`. `Uint8Array.from`
 * always allocates a plain `ArrayBuffer`, so this states what it already returns.
 */
function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}
