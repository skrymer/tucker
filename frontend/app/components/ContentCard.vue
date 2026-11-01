<script setup lang="ts">
/**
 * A card whose read can fail names what failed ("Couldn't load …"): set, the
 * error makes the body the nested load-error row under the band.
 */
type ReadState =
  | { error?: null; errorTitle?: string }
  | { error: unknown; errorTitle: string }

/**
 * The body's state short of ready — one at a time (DESIGN.md → Content card):
 * - `loading`: a skeleton stands in for the body;
 * - `busy`: the body already shown stays up while it is re-read;
 * - `empty`: nothing here yet, and the `empty` slot says what to do next.
 */
type BodyState = 'loading' | 'busy' | 'empty'

// Stryker disable next-line all: a compiler macro must stay a top-level statement
const props = defineProps<
  {
    subject: ContentCardSubject
    title: string
    state?: BodyState
  } & ReadState
>()
const emit = defineEmits<{ retry: [] }>()

const headingId = useId()
const busy = computed(() => props.state === 'loading' || props.state === 'busy')
</script>

<template>
  <UCard as="section" :aria-labelledby="headingId" :aria-busy="busy">
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
        <!-- A readout of the body has nothing to say once the body failed. -->
        <slot v-if="!error" name="trailing" />
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
           and each USkeleton would otherwise raise an alert. It shows 150 ms
           late (ADR 0007), so a fast answer never flashes it. -->
      <div
        v-if="state === 'loading'"
        aria-hidden="true"
        class="appear-late flex flex-col gap-2"
      >
        <USkeleton class="h-6 w-1/3" />
        <USkeleton class="h-4 w-2/3" />
        <USkeleton class="h-4 w-1/2" />
      </div>
      <slot v-else-if="state === 'empty'" name="empty" />
      <slot v-else />
    </LoadErrorState>
  </UCard>
</template>
