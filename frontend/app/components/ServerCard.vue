<script setup lang="ts">
import type { ActuatorHealth } from '~/utils/serverFigures'

/** Actuator answers DOWN with a 503 carrying the health: a result, not a failed read. */
function downAsAResult(error: unknown) {
  const { data } = error as { data?: ActuatorHealth }
  if (statusOf(error) === 503 && data?.status) return data
  throw error
}

// The spec types both reads as Actuator describes them, bodies without properties.
function useServerFigures() {
  const { $api } = useNuxtApp()
  return useAsyncData('server-figures', async () => {
    const [scrape, health] = await Promise.all([
      $api('/api/actuator/prometheus', { responseType: 'text' }),
      $api('/api/actuator/health').catch(downAsAResult),
    ])
    return serverFiguresFrom(
      scrape as unknown as string,
      health as unknown as ActuatorHealth,
    )
  })
}

/** An uptime in its two largest units. */
function uptime(seconds: number) {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (d) return `${d} d ${h} h`
  if (h) return `${h} h ${m} min`
  return m ? `${m} min ${s} s` : `${s} s`
}

// Not awaited, so the page's own metrics paint without waiting on the server's reads.
const { data: figures, error, pending, refresh } = useServerFigures()
const up = computed(() => figures.value?.health === 'UP')
</script>

<template>
  <UCard as="section" aria-labelledby="server-heading" :aria-busy="pending">
    <div class="flex flex-col gap-5">
      <div class="flex items-start justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h2 id="server-heading" class="text-h2 text-highlighted">Server</h2>
          <p class="text-sm text-muted">
            Since the last restart<template v-if="figures"
              >,
              <strong class="text-highlighted tabular-nums">{{
                uptime(figures.uptimeSeconds)
              }}</strong>
              ago</template
            >. The range and engine filters above don't apply.
          </p>
        </div>
        <!-- Health is the one coloured state, and never the colour alone. -->
        <span
          v-if="figures && !error"
          class="flex shrink-0 items-center gap-1.5 text-sm font-semibold"
          :class="up ? 'text-success' : 'text-error'"
        >
          <UIcon
            :name="up ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
            class="size-4"
            aria-hidden="true"
          />
          {{ up ? 'Up' : 'Down' }}
        </span>
      </div>
      <LoadErrorState
        nested
        :error="error"
        title="Couldn't read the server figures"
        @retry="refresh"
      >
        <div v-if="figures" class="flex flex-col gap-5">
          <ServerMeters :figures="figures" />
          <EndpointTimingTable :endpoints="figures.endpoints" />
        </div>
        <!-- The first read only (ADR 0007's cold load). Decorative, so hidden:
             the card's aria-busy says it is loading, and each USkeleton would
             otherwise raise an alert. -->
        <div
          v-else
          aria-hidden="true"
          data-testid="server-skeleton"
          class="appear-late flex flex-col gap-5"
        >
          <div class="grid grid-cols-5 gap-4">
            <USkeleton
              v-for="n in 5"
              :key="n"
              class="h-[4.5rem] rounded-inset"
            />
          </div>
          <div class="flex flex-col gap-2">
            <USkeleton v-for="n in 4" :key="n" class="h-7 w-full" />
          </div>
        </div>
      </LoadErrorState>
    </div>
  </UCard>
</template>
