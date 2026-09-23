<script setup lang="ts">
// PROTOTYPE — throwaway variant switcher. Dev builds only.
const props = defineProps<{ variants: { key: string; name: string }[] }>()

const route = useRoute()
const router = useRouter()

const current = computed(() => {
  const v = String(route.query.variant ?? props.variants[0]!.key)
  return props.variants.find((x) => x.key === v) ?? props.variants[0]!
})

function step(by: number) {
  const i = props.variants.indexOf(current.value)
  const next =
    props.variants[(i + by + props.variants.length) % props.variants.length]!
  router.replace({ query: { ...route.query, variant: next.key } })
}

function onKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (t?.closest('input, textarea, [contenteditable]')) return
  if (e.key === 'ArrowLeft') step(-1)
  if (e.key === 'ArrowRight') step(1)
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div
    class="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 lg:bottom-6"
  >
    <div
      class="flex items-center gap-2 rounded-full border-2 border-dashed border-warning bg-inverted px-2 py-1 text-inverted shadow-lg"
    >
      <button
        type="button"
        class="rounded-full p-1.5 hover:bg-elevated/20"
        aria-label="Previous variant"
        @click="step(-1)"
      >
        <UIcon name="i-lucide-chevron-left" class="size-5" />
      </button>
      <span class="min-w-48 text-center text-sm font-medium">
        <span class="text-warning">Spike</span> · {{ current.key }} —
        {{ current.name }}
      </span>
      <button
        type="button"
        class="rounded-full p-1.5 hover:bg-elevated/20"
        aria-label="Next variant"
        @click="step(1)"
      >
        <UIcon name="i-lucide-chevron-right" class="size-5" />
      </button>
    </div>
  </div>
</template>
