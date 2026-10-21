<script setup lang="ts">
// Wide because its charts need the room. A User who is not an Admin, or whose
// `/api/me` fails, meets the same 404 an unknown path does, so the page's
// existence tells them nothing (ADR 0039). Raised from the page once the route has
// changed, so the address reads /admin as an unknown path's does. An expired
// session goes through to the layout, which shows the signed-out state instead.
// Stryker disable next-line all: a compiler macro must stay a top-level statement
definePageMeta({ wideColumn: true })

const route = useRoute()
const { isAdmin, ready } = useMe()
await ready()
if (!isAdmin.value && !useAuthGate().isSignedOut.value) {
  throw createError({
    statusCode: 404,
    statusMessage: `Page not found: ${route.fullPath}`,
    fatal: true,
  })
}

const { data: report } = await useApi('/api/admin/metrics')
const routes = computed(() => report.value?.routes ?? [])
</script>

<template>
  <div>
    <!-- The same breakpoint as the shell's side nav, where the Admin item lives. -->
    <p class="text-body text-muted lg:hidden">
      Metrics are built for a larger screen.
    </p>
    <section class="hidden flex-col gap-4 lg:flex">
      <header class="flex flex-col gap-1">
        <p class="text-eyebrow text-muted">Admin</p>
        <h1 class="text-h1 text-default">Metrics</h1>
      </header>
      <!-- Lazy: unovis puts an <svg> of its own into <body> as its chunk loads,
           and a page with nothing to chart has no reason to load it. -->
      <LazyRouteTimingCard v-if="routes.length" :routes="routes" />
      <div v-else class="flex flex-col items-center gap-3 py-12 text-center">
        <UIcon name="i-lucide-gauge" class="size-10 text-muted" aria-hidden />
        <h2 class="text-h2 text-highlighted">Nothing measured yet</h2>
        <p class="max-w-xs text-sm text-muted">
          Page timings appear here once Tucker starts recording them.
        </p>
      </div>
    </section>
  </div>
</template>
