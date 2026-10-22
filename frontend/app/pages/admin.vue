<script setup lang="ts">
import type { paths } from '#open-fetch-schemas/api'

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

type MetricsQuery = NonNullable<
  paths['/api/admin/metrics']['get']['parameters']['query']
>
type Filters = {
  range: NonNullable<MetricsQuery['range']>
  engine: NonNullable<MetricsQuery['engine']> | 'all'
  version: string
  openedIn: 'installed' | 'browser' | 'all'
}

const DEFAULT_FILTERS: Filters = {
  range: '30d',
  engine: 'all',
  version: 'all',
  openedIn: 'all',
}

/** The Admin's filters, as chosen and as the read sends them: 'all' sends nothing. */
function useMetricFilters() {
  const chosen = reactive({ ...DEFAULT_FILTERS })
  const reset = () => Object.assign(chosen, DEFAULT_FILTERS)
  const query = computed(() => ({
    range: chosen.range,
    engine: chosen.engine === 'all' ? undefined : chosen.engine,
    version: chosen.version === 'all' ? undefined : chosen.version,
    installed:
      chosen.openedIn === 'all' ? undefined : chosen.openedIn === 'installed',
  }))
  const narrowed = computed(() =>
    Object.entries(DEFAULT_FILTERS).some(
      ([key, value]) => chosen[key as keyof typeof chosen] !== value,
    ),
  )
  return { chosen, query, narrowed, reset }
}

const { chosen, query, narrowed, reset } = useMetricFilters()
const {
  data: report,
  error: reportError,
  pending,
  refresh,
} = await useApi('/api/admin/metrics', { query })
const routes = computed(() => report.value?.routes ?? [])
// Whether the report on screen was read narrowed; a read under way leaves it be.
const reportNarrowed = ref(narrowed.value)
watch(report, () => (reportNarrowed.value = narrowed.value))
const isDesktop = useIsDesktop()

const RANGES = [
  { label: 'Last 24 hours', value: '24h' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 90 days', value: '90d' },
] satisfies { label: string; value: Filters['range'] }[]
const ENGINES = [
  { label: 'All engines', value: 'all' },
  { label: 'WebKit', value: 'webkit' },
  { label: 'Blink', value: 'blink' },
  { label: 'Gecko', value: 'gecko' },
] satisfies { label: string; value: Filters['engine'] }[]
const OPENED_IN = [
  { label: 'Installed or browser', value: 'all' },
  { label: 'Installed', value: 'installed' },
  { label: 'Browser', value: 'browser' },
] satisfies { label: string; value: Filters['openedIn'] }[]

/** The filter row: each filter's label and choices, the versions the range holds. */
const filters = computed(() => [
  { key: 'range' as const, label: 'Range', items: RANGES },
  { key: 'engine' as const, label: 'Engine', items: ENGINES },
  {
    key: 'version' as const,
    label: 'App version',
    items: [
      { label: 'All versions', value: 'all' },
      ...(report.value?.versions ?? []).map((v) => ({ label: v, value: v })),
    ],
  },
  { key: 'openedIn' as const, label: 'Opened in', items: OPENED_IN },
])
</script>

<template>
  <div>
    <!-- The same breakpoint as the shell's side nav, where the Admin item lives. -->
    <p class="text-body text-muted lg:hidden">
      Metrics are built for a larger screen.
    </p>
    <section
      aria-labelledby="admin-heading"
      :aria-busy="pending"
      class="hidden flex-col gap-4 lg:flex"
    >
      <header class="flex flex-col gap-1">
        <p class="text-eyebrow text-muted">Admin</p>
        <h1 id="admin-heading" class="text-h1 text-default">Metrics</h1>
      </header>
      <div
        v-if="isDesktop"
        role="group"
        aria-label="Filters"
        class="flex flex-wrap items-end gap-4"
      >
        <UFormField v-for="f in filters" :key="f.key" :label="f.label">
          <USelect v-model="chosen[f.key]" :items="f.items" class="w-44" />
        </UFormField>
      </div>
      <!-- Mounted only where it shows, and lazy: unovis puts an <svg> of its own
           into <body> as its chunk loads, and a phone or a page with nothing to
           chart has no reason to load it. -->
      <LoadErrorState
        v-if="isDesktop"
        :error="reportError"
        title="Couldn't load the metrics"
        @retry="refresh"
      >
        <!-- A refetch keeps the last answer up, dimmed (ADR 0007); the delay
             means an answer faster than 150 ms never dims. -->
        <div
          class="transition-opacity delay-150"
          :class="pending && 'opacity-50'"
        >
          <LazyRouteTimingCard v-if="routes.length" :routes="routes" />
          <div
            v-else-if="reportNarrowed"
            class="flex flex-col items-center gap-3 py-12 text-center"
          >
            <UIcon
              name="i-lucide-filter-x"
              class="size-10 text-muted"
              aria-hidden
            />
            <h2 class="text-h2 text-highlighted">
              Nothing matches these filters
            </h2>
            <UButton label="Reset filters" variant="outline" @click="reset" />
          </div>
          <div
            v-else
            class="flex flex-col items-center gap-3 py-12 text-center"
          >
            <UIcon
              name="i-lucide-gauge"
              class="size-10 text-muted"
              aria-hidden
            />
            <h2 class="text-h2 text-highlighted">
              Nothing measured in the last 30 days
            </h2>
            <p class="max-w-xs text-sm text-muted">
              Page timings appear here once Tucker records them. A wider range
              looks further back.
            </p>
          </div>
        </div>
      </LoadErrorState>
    </section>
  </div>
</template>
