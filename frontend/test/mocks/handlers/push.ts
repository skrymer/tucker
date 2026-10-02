import type { components } from '#open-fetch-schemas/api'
import { http } from '../http'

type Subscription = components['schemas']['SubscriptionDto']

/** The VAPID public key: a valid base64url, so the browser can decode it. */
export const vapidPublicKey =
  'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'

/**
 * The key a device subscribes with. Subscribing and unsubscribing are not in
 * the baseline: a page that writes a Push Subscription unasked fails its test.
 */
export const pushHandlers = [
  http.get('/api/push/vapid-public-key', ({ response }) =>
    response(200).json({ publicKey: vapidPublicKey }),
  ),
]

/**
 * The push service seen from [device], the browser the test stubs. A
 * subscription is refused without its endpoint and both keys, as the backend
 * refuses the body; and nothing a page sends about a device is ever shown, so
 * one for any other device, or an unsubscribe naming another endpoint, is
 * refused too — standing in for a page that registered the wrong thing.
 */
export function pushServiceFor(device: Subscription) {
  return [
    http.post('/api/push/subscriptions', async ({ request, response }) => {
      const { endpoint, keys, label } = await request.json()
      if (!endpoint || !keys?.p256dh || !keys.auth) {
        return response(400).json({
          message: 'a subscription needs its endpoint and both keys',
        })
      }
      const sameDevice =
        endpoint === device.endpoint &&
        keys.p256dh === device.keys.p256dh &&
        keys.auth === device.keys.auth &&
        (label ?? null) === (device.label ?? null)
      if (!sameDevice) {
        return response(400).json({ message: `${endpoint} is not this device` })
      }
      return response(201).empty()
    }),
    http.delete('/api/push/subscriptions', async ({ request, response }) => {
      const { endpoint } = await request.json()
      if (endpoint !== device.endpoint) {
        return response(400).json({ message: `${endpoint} is not this device` })
      }
      return response(204).empty()
    }),
  ]
}
