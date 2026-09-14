<script setup lang="ts" generic="T extends string | number">
import type { TabsItem } from '@nuxt/ui'

defineProps<{
  items: TabsItem[]
  /** What the choice is *of* — "Period", "Window". */
  label: string
}>()

const chosen = defineModel<T>({ required: true })
</script>

<template>
  <!-- `role`/`aria-label` land on the root, not on the tablist Reka renders
       inside it, so the name is carried by a group around the tabs rather than
       by the tablist itself, which would otherwise offer tabs with no clue what
       they switch. -->
  <UTabs
    v-model="chosen"
    :items="items"
    :content="false"
    variant="pill"
    size="xs"
    color="primary"
    role="group"
    :aria-label="label"
  />
</template>
