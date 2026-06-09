/*
 * Weekly-Review Reminder service-worker handlers (F6 slice 3).
 *
 * Imported into the Workbox-generated service worker via
 * `pwa.workbox.importScripts` in nuxt.config.ts (keeping Workbox in charge of the
 * precache / offline shell from slice 1). It adds the two push lifecycle handlers
 * the generated worker has no opinion on:
 *
 *  - `push`: render the reminder the backend sent (ADR 0010). The notification is
 *    tagged so a repeat for the same overdue episode replaces the previous one
 *    rather than stacking, and carries the icon + monochrome badge.
 *  - `notificationclick`: focus an already-open Tucker window (navigating it to the
 *    target) or open a new one at /today.
 *
 * Plain classic-worker JS (importScripts is not an ES module) and pure browser
 * glue — covered by /verify (a real push via DevTools) and the reminder smoke,
 * not a unit test (ADR 0013).
 */
/* global self, clients */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = {}
  }

  const title = payload.title || 'Tucker'
  const options = {
    body: payload.body || '',
    icon: '/icons/pwa-192x192.png',
    badge: '/icons/badge-72x72.png',
    // One reminder per overdue episode: a repeat replaces, never stacks.
    tag: 'weekly-review-reminder',
    data: { url: payload.url || '/today' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/today'

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (
            new URL(client.url).origin === self.location.origin &&
            'focus' in client
          ) {
            if ('navigate' in client) client.navigate(targetUrl)
            return client.focus()
          }
        }
        return clients.openWindow ? clients.openWindow(targetUrl) : undefined
      }),
  )
})
