<script setup lang="ts">
/**
 * Not a page — a legacy alias for Today, kept alive for one caller.
 *
 * Weekly-Review Reminders shipped before issue #178 deep-linked to `/today`, a
 * path that never existed. A Reminder carries the path it was sent with, and no
 * deploy can reach into a device's tray to rewrite it, so fixing the payload
 * alone would never reach the ones already delivered.
 *
 * Today's canonical URL stays `/` (`utils/navigation.ts`) — never link here.
 *
 * It has to be a client route: the Workbox `navigateFallback` serves the
 * precached shell for every non-`/api` navigation, so a nitro redirect would
 * never run on exactly the installed PWAs this exists for.
 *
 * That same fallback bounds what this can rescue. A tap is handled by whichever
 * service worker is already active, and it serves its own precached shell
 * cache-first — so on a device that has not yet picked up this deploy, the first
 * tap still lands on the old route table and 404s. The SW update then reloads the
 * page and the redirect takes over. In practice: reliable from the second tap, or
 * from the first once the app has been opened on that device post-deploy.
 *
 * Safe to delete once no pre-#178 Reminder can still be in a tray — they collapse
 * onto one `tag` and fire at most once per overdue episode, so a month past this
 * deploy (2026-07-28) is generous.
 */
definePageMeta({ redirect: '/' })
</script>
