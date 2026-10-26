<script setup lang="ts">
import type { ServerFigures } from '~/utils/serverFigures'

const props = defineProps<{ figures: ServerFigures }>()

const percent = (share: number) =>
  share < 0.1 ? `${(share * 100).toFixed(1)}%` : `${Math.round(share * 100)}%`
const bytes = (b: number) =>
  b >= 1024 ** 3
    ? `${(b / 1024 ** 3).toFixed(1)} GB`
    : `${Math.round(b / 1024 ** 2)} MB`
const seconds = (s: number) =>
  s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toFixed(1)} s`

// A ring in a 48-unit box.
const R = 19
// A sliver stays drawn at 0%, so an idle meter still reads as a meter.
const dashOffset = (share: number) =>
  ringDashOffset(Math.max(0.02, share), 1, R)

/** The meters that read the present, each as a share of its whole. */
const rings = computed(() => {
  const f = props.figures
  const diskUsed = f.diskTotalBytes - f.diskFreeBytes
  return [
    {
      title: 'Process CPU',
      share: f.processCpu,
      value: percent(f.processCpu),
      meta: "Tucker's own share",
    },
    {
      title: 'System CPU',
      share: f.systemCpu,
      value: percent(f.systemCpu),
      meta: 'the host, as seen',
    },
    {
      title: 'Heap',
      share: f.heapUsedBytes / f.heapMaxBytes,
      value: bytes(f.heapUsedBytes),
      meta: `used of ${bytes(f.heapMaxBytes)}`,
    },
    {
      title: 'Disk used',
      share: diskUsed / f.diskTotalBytes,
      value: bytes(diskUsed),
      meta: `of ${bytes(f.diskTotalBytes)}, ${bytes(f.diskFreeBytes)} free`,
    },
  ]
})
</script>

<template>
  <div class="grid grid-cols-5 gap-4">
    <div
      v-for="r in rings"
      :key="r.title"
      role="group"
      :aria-label="r.title"
      class="flex items-center gap-3 rounded-inset bg-elevated/50 p-3"
    >
      <svg
        viewBox="0 0 48 48"
        class="size-12 shrink-0 -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="24"
          cy="24"
          :r="R"
          fill="none"
          stroke="var(--ui-border-accented)"
          stroke-width="5"
        />
        <circle
          cx="24"
          cy="24"
          :r="R"
          fill="none"
          stroke="var(--tucker-cat-1)"
          stroke-width="5"
          stroke-linecap="round"
          :stroke-dasharray="ringCircumference(R)"
          :stroke-dashoffset="dashOffset(r.share)"
        />
      </svg>
      <div class="flex min-w-0 flex-col">
        <span class="text-label text-muted"
          >{{ r.title }} <span class="text-dimmed">· now</span></span
        >
        <span class="text-stat text-highlighted tabular-nums">{{
          r.value
        }}</span>
        <span class="text-xs text-muted">{{ r.meta }}</span>
      </div>
    </div>
    <div
      role="group"
      aria-label="GC pauses"
      class="flex flex-col justify-center gap-0.5 rounded-inset bg-elevated/50 p-3"
    >
      <span class="text-label text-muted">GC pauses</span>
      <span class="text-stat text-highlighted tabular-nums">{{
        seconds(figures.gcPauseTotalSeconds)
      }}</span>
      <span class="text-xs text-muted">
        over {{ figures.gcPauseCount.toLocaleString('en-AU') }} pauses since the
        restart
      </span>
    </div>
  </div>
</template>
