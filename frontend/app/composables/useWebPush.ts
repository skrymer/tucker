/**
 * The device's Weekly-Review Reminder subscription, as a deep composable: it
 * owns the browser push machinery (permission, the service worker's PushManager)
 * and the Push Subscription transport (POST/DELETE), exposing a small intent
 * surface — `enable()` / `disable()` — plus the state the settings control
 * branches on. The user's reminder *preferences* (timezone, hour, on/off) live
 * on the Profile and are saved by the control, not here (CONTEXT.md).
 */
export function useWebPush() {
  const { $api } = useNuxtApp()

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
    () => platform.value === 'ios' && !isInstalled.value,
  )

  const isSubscribed = ref(false)
  // The user's local zone, defaulted from the browser — the settings control
  // saves it on the Profile when enabling reminders (CONTEXT.md Profile).
  const timezone = ref(Intl.DateTimeFormat().resolvedOptions().timeZone)

  onMounted(async () => {
    if (!isSupported.value) return
    const registration = await navigator.serviceWorker.ready
    isSubscribed.value =
      (await registration.pushManager.getSubscription()) !== null
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
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })

    await $api('/api/push/subscriptions', {
      method: 'POST',
      body: { ...subscription.toJSON(), label },
    })
    isSubscribed.value = true
  }

  /** Turn off reminders for this device: unsubscribe the browser and forget the row. */
  async function disable() {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      const { endpoint } = subscription
      await subscription.unsubscribe()
      await $api('/api/push/subscriptions', {
        method: 'DELETE',
        body: { endpoint },
      })
    }
    isSubscribed.value = false
  }

  return {
    isSupported,
    isSubscribed,
    requiresInstall,
    timezone,
    enable,
    disable,
  }
}

/** Decode the base64url VAPID key into the byte array PushManager requires. */
function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}
