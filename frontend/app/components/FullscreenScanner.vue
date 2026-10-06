<script setup lang="ts">
/**
 * The phone's barcode scanner: the camera fills the viewport, with a caption at
 * the top and Stop within thumb reach (ADR 0006). The decoder reads the whole
 * frame, so there is no aiming box. Bind `v-model:video-el` to the scanner
 * composable's `videoEl`, which the stream attaches to once the `<video>`
 * mounts in here. It is open while the scanner is requesting or scanning.
 */
const props = defineProps<{ state: ScannerState }>()

const caption = computed(() =>
  props.state === 'scanning'
    ? 'Point the camera at a barcode'
    : 'Starting the camera…',
)
const videoEl = defineModel<HTMLVideoElement | null>('videoEl')

const emit = defineEmits<{ stop: [] }>()

function bindVideo(el: unknown) {
  videoEl.value = el as HTMLVideoElement | null
}
</script>

<template>
  <UModal
    :open="state === 'requesting' || state === 'scanning'"
    title="Barcode scanner"
    fullscreen
    :dismissible="false"
    :close="false"
  >
    <template #content>
      <div class="relative h-full w-full bg-black">
        <video
          :ref="bindVideo"
          class="h-full w-full object-cover"
          playsinline
          muted
          autoplay
          aria-hidden="true"
        ></video>
        <!-- Backed, not just shadowed: a package held close fills the frame
             with white, and the caption must read over it. -->
        <p
          class="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+1rem)] mx-auto w-fit rounded-full bg-black/60 px-4 py-1.5 text-center text-base font-medium text-white"
        >
          {{ caption }}
        </p>
        <UButton
          class="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+2rem)] mx-auto w-fit"
          size="xl"
          color="neutral"
          variant="solid"
          icon="i-lucide-square"
          @click="emit('stop')"
        >
          Stop
        </UButton>
      </div>
    </template>
  </UModal>
</template>
