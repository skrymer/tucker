<script setup lang="ts">
// The first load and the taps, beside the moves between pages (ADR 0038): each
// layout's p75 for each, whichever route it happened on.
import type { components } from '#open-fetch-schemas/api'

type WebVitals = components['schemas']['WebVitalsResponse']

const props = defineProps<{ webVitals: WebVitals }>()

const TILES = [
  { key: 'lcp', title: 'Page load (LCP)' },
  { key: 'inp', title: 'Interaction (INP)' },
] as const

const tiles = computed(() =>
  TILES.map((t) => ({ ...t, layouts: props.webVitals[t.key] })),
)
</script>

<template>
  <UCard>
    <div class="flex flex-col gap-1">
      <h2 class="text-h2 text-highlighted">Page load and interaction</h2>
      <p class="text-sm text-muted">
        Each layout's p75, whichever page it happened on
      </p>
    </div>
    <div class="mt-4 grid grid-cols-2 gap-4">
      <section
        v-for="t in tiles"
        :key="t.key"
        :aria-labelledby="`vital-${t.key}`"
        class="flex flex-col gap-2 rounded-inset bg-elevated/50 p-4"
      >
        <h3 :id="`vital-${t.key}`" class="text-label text-default">
          {{ t.title }}
        </h3>
        <!-- A table, so each figure is named by its layout in every browser. -->
        <table class="w-full">
          <tr v-for="l in t.layouts" :key="l.layout">
            <th scope="row" class="py-0.5 text-left text-body text-muted">
              {{ LAYOUT_NAMES[l.layout] }}
            </th>
            <td class="py-0.5 text-right text-body text-default tabular-nums">
              <UTooltip :text="figuresLine(l)" :disabled="l.p75 == null">
                <span tabindex="0">
                  {{ p75Label(l) }}
                </span>
              </UTooltip>
            </td>
          </tr>
        </table>
      </section>
    </div>
  </UCard>
</template>
