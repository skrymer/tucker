<script setup lang="ts">
// The optional barcode pre-fill under the Add-Food form (ADR 0006): scan with
// the camera or type the number, then look it up. A camera-decoded barcode runs
// the exact same look-up as a typed one. The look-up itself belongs to the
// sheet, whose form it fills.
const props = defineProps<{
  /** Whether the Food builder is in view; leaving it releases the camera. */
  active: boolean
  looking: boolean
  /** No source could be reached, so the blank form would assert too much. */
  inconclusive: boolean
}>()
const barcode = defineModel<string>('barcode', { required: true })
const emit = defineEmits<{ lookup: [] }>()

// The camera scanner is a peer input to the manual field, lazy-loading
// zxing-wasm behind the Scan tap (ADR 0006).
const scanner = useBarcodeScanner()
const {
  state: scanState,
  videoEl,
  barcode: scannedBarcode,
  stop: stopScan,
} = scanner
// On a phone the camera is fullscreen, over the sheet.
const { fullscreen: scanFullscreen, startFromTap: scanFromTap } =
  useFullscreenScanner(scanner)

watch(scannedBarcode, (code) => {
  if (!code) return
  barcode.value = code
  emit('lookup')
})

// Dismissing the sheet — or switching to the Recipe builder — must release the
// camera: the overlay and the tabs both keep this mounted while hidden, so
// unmounting alone would leave the light on and let a stray decode hijack the
// sheet (ADR 0006, "never leave the camera light on").
watch(
  () => props.active,
  (active) => {
    if (!active) stopScan()
  },
)
</script>

<template>
  <USeparator label="or pre-fill from a barcode" />

  <div class="flex flex-col gap-3">
    <p class="text-center text-xs text-muted">
      Scan or type a product's barcode to fill in the details above.
    </p>

    <!-- No source could be reached, so the blank form above would otherwise
         assert something nobody established. An inline note, not a toast:
         this surface is already in focus, and a look-up failure is not a
         mutation failure (ADR 0005 / 0007). No Retry button either — "Look up"
         is right below. -->
    <UAlert
      v-if="inconclusive"
      icon="i-lucide-cloud-off"
      color="warning"
      variant="subtle"
      title="Couldn't look that up"
      description="The lookup didn't get through, so Tucker can't say whether this product is known. Try again in a moment, or just fill in the details above."
    />

    <UButton
      v-if="scanState === 'idle' || scanState === 'decoded'"
      block
      icon="i-lucide-scan-barcode"
      color="primary"
      variant="subtle"
      @click="scanFromTap"
    >
      Scan barcode
    </UButton>

    <UButton
      v-else-if="scanState === 'requesting'"
      block
      color="primary"
      variant="subtle"
      loading
      disabled
    >
      Requesting camera…
    </UButton>

    <div
      v-else-if="!scanFullscreen && scanState === 'scanning'"
      class="relative overflow-hidden rounded-lg bg-black"
    >
      <video
        ref="videoEl"
        class="max-h-[45vh] w-full object-cover"
        playsinline
        muted
        autoplay
        aria-hidden="true"
      ></video>
      <p
        class="absolute inset-x-0 top-2 text-center text-sm font-medium text-white drop-shadow"
      >
        Point the camera at a barcode
      </p>
      <UButton
        class="absolute inset-x-0 bottom-3 mx-auto w-fit"
        color="neutral"
        variant="solid"
        icon="i-lucide-square"
        @click="stopScan"
      >
        Stop
      </UButton>
    </div>

    <UAlert
      v-if="scanState === 'denied'"
      icon="i-lucide-camera-off"
      color="warning"
      variant="subtle"
      title="Camera access is blocked"
      description="Enable it in your device settings, or enter the barcode below."
    />

    <UAlert
      v-else-if="scanState === 'unsupported'"
      icon="i-lucide-camera-off"
      color="neutral"
      variant="subtle"
      title="Camera scanning isn't available here"
      description="Enter the barcode below instead."
    />

    <!-- Not a <form>: this lives inside AddFoodForm's <form>, and nested forms
         are invalid. Look up is a button; Enter triggers it too. -->
    <div class="flex items-end gap-2">
      <UFormField label="Barcode" hint="optional" name="barcode" class="flex-1">
        <UInput
          v-model="barcode"
          inputmode="numeric"
          placeholder="Type a barcode number"
          class="w-full"
          @keydown.enter.prevent="emit('lookup')"
        />
      </UFormField>
      <UButton
        type="button"
        color="neutral"
        variant="subtle"
        :loading="looking"
        @click="emit('lookup')"
      >
        Look up
      </UButton>
    </div>
  </div>

  <FullscreenScanner
    v-if="scanFullscreen"
    v-model:video-el="videoEl"
    :state="scanState"
    @stop="stopScan"
  />
</template>
