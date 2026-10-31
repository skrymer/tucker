<script setup lang="ts">
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineProps<{
  subject: ContentCardSubject
  title: string
  /** A failed read: the body becomes the nested load-error row under the band. */
  error?: unknown
  /** "Couldn't load …" — what the load-error row says failed. */
  errorTitle?: string
  loading?: boolean
  /** Nothing here yet: the `empty` slot, saying what to do next, stands in for the body. */
  empty?: boolean
}>()
const emit = defineEmits<{ retry: [] }>()

const headingId = useId()
</script>

<template>
  <UCard as="section" :aria-labelledby="headingId" :aria-busy="loading">
    <!-- On a narrow phone the trailing slot drops under the title rather than
         either one truncating. -->
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2
          :id="headingId"
          class="flex items-center gap-2 text-h2 text-highlighted"
        >
          <UIcon
            :name="CONTENT_CARD_SUBJECTS[subject]"
            class="size-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          {{ title }}
        </h2>
        <slot name="trailing" />
      </div>
    </template>
    <!-- LoadErrorState is itself the switch: its row when `error` is set, its
         slot (the body) when it is not. -->
    <LoadErrorState
      nested
      :error="error"
      :title="errorTitle ?? ''"
      @retry="emit('retry')"
    >
      <!-- Decorative, so hidden: the region's aria-busy says it is loading,
           and each USkeleton would otherwise raise an alert. -->
      <div v-if="loading" aria-hidden="true" class="flex flex-col gap-2">
        <USkeleton class="h-6 w-1/3" />
        <USkeleton class="h-4 w-2/3" />
        <USkeleton class="h-4 w-1/2" />
      </div>
      <slot v-else-if="empty" name="empty" />
      <slot v-else />
    </LoadErrorState>
  </UCard>
</template>
