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
 *    target) or open a new one at Today.
 *
 * Plain classic-worker JS (importScripts is not an ES module) and pure browser
 * glue — covered by /verify (a real push via DevTools) and the reminder smoke,
 * not a unit test (ADR 0013).
 */
/* global self, clients */

/**
 * Where a reminder lands. Today is `/`, not `/today`. The backend's nudge is text
 * only, because its copy of this path disagreed with the route table for months,
 * uncaught, until a tap 404'd (issues #178, #189) — so this is now the one place the
 * reminder names a destination. It is still hand-matched to `app/utils/navigation.ts`
 * rather than imported: a classic worker loaded by `importScripts` cannot import an
 * ES module, so two copies is the floor here, not three.
 */
const TODAY_URL = '/'

/** A new Tucker window at the target, when no open one can be sent there. */
function openTucker(targetUrl) {
  return clients.openWindow ? clients.openWindow(targetUrl) : undefined
}

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
    // The backend names no destination (issue #189); this worker owns it. Stamped
    // onto the notification rather than read from TODAY_URL at tap time — see the
    // click handler for why that round-trip is load-bearing.
    data: { url: TODAY_URL },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  // Read back rather than assumed: a notification shown by an older worker can still
  // be sitting in the tray carrying its own target, so inlining TODAY_URL here would
  // silently redirect it. That is also why the `/today` alias page outlives this
  // change (issue #191).
  const targetUrl =
    (event.notification.data && event.notification.data.url) || TODAY_URL

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        const open = windowClients.find(
          (client) =>
            new URL(client.url).origin === self.location.origin &&
            'focus' in client,
        )
        if (!open) return openTucker(targetUrl)
        if (!('navigate' in open)) return open.focus()

        // `includeUncontrolled` deliberately returns windows this worker does not
        // control (loaded before it claimed, or just after an update), and
        // navigate() rejects with a TypeError for exactly those. Awaiting it is what
        // separates landing on Today from focusing whatever screen happened to be
        // open — fire-and-forget left the rejection unhandled and focused anyway
        // (issue #190). A *resolved* null is the separate, benign case of the client
        // having gone away, which leaves the original window the one to focus.
        return open
          .navigate(targetUrl)
          .then((navigated) => (navigated || open).focus())
          .catch((error) => {
            // Either step failing means the same thing to the user — no open window
            // made it to Today — and a fresh one is the recovery for both.
            console.warn(
              'Could not land an open Tucker window on',
              targetUrl,
              '- opening a new one instead',
              error,
            )
            return openTucker(targetUrl)
          })
      }),
  )
})
