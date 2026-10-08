<script setup lang="ts">
// A Check (ADR 0022): scan a package to see what it costs and returns against
// the whole day's targets, before buying or eating it. Nothing is created — no
// Food, no Entry — and the camera is the only way in. That narrows nothing in
// the Add-Food flow, where manual barcode and macro entry stay always-on peers
// (ADR 0006); the difference is that a Check produces nothing worth typing for.
import type { Ref } from 'vue'

const today = localToday()

// The summary supplies the setup gate's Calorie Budget — and this read is what
// advances the weekly cadence (ADR 0010). A Check depends on that rather than
// coinciding with it: it computes nothing itself, so dropping this read would
// leave it stating figures against a Budget an overdue week has staled.
const {
  data: summary,
  error: summaryError,
  refresh,
} = await useApi('/api/summary', { query: { date: today } })

// Every figure a Check states is a share of the Budget or the Floor. Without one
// there is no denominator, and inventing it would state confident nonsense about
// a product the user is deciding to buy (ADR 0022).
//
// A missing Budget means two different things that earn opposite messages, and
// `setupComplete` is what tells them apart — both off the same response, so the
// three states partition rather than being re-joined from two endpoints. Setup
// finished with no Budget *is* Calorie Tracking off: the engine derives one for
// everybody else, and this page's own summary read is what runs a due review
// (ADR 0010), so there is no window where a tracking User arrives without one.
const hasBudget = computed(() => summary.value?.calorieBudget != null)

/**
 * The camera follows the tab: opening it starts the camera, leaving it releases
 * it, and returning from the background brings it back. A denied or absent
 * camera ends the tab with no degraded mode — the accepted trade for keeping a
 * Check a two-second interaction.
 */
function useCameraLifecycle(scanner: ReturnType<typeof useBarcodeScanner>) {
  const { state, interrupted, start, stop } = scanner
  /** Start only when there is a Budget to measure against and nothing on screen. */
  function startIfReady() {
    if (hasBudget.value && state.value === 'idle') start()
  }

  onMounted(() => {
    // Warm the WASM decoder alongside the camera permission rather than after
    // it: the two depend on nothing of each other.
    if (hasBudget.value) void import('zxing-wasm/reader')
    startIfReady()
  })
  // A failed summary load leaves no Budget and so no scanner; retrying it must
  // bring the camera up rather than leave a viewfinder that never starts.
  watch(hasBudget, startIfReady)
  // The composable releases the camera when the app is backgrounded, which on a
  // phone is one app-switch away — and this screen is used in a shop. Bring it
  // back on return, or the tab is a dead black box until the user finds a button.
  // Only a camera the backgrounding took: one the User stopped stays stopped.
  function onVisible() {
    if (document.visibilityState === 'visible' && interrupted.value)
      startIfReady()
  }
  document.addEventListener('visibilitychange', onVisible)
  // Leaving the tab must release the camera; the composable also drops it on
  // page-hide and visibility loss, but a client-side route change is neither.
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    stop()
  })
}

/**
 * Each state says what is actually true — an idle viewfinder claiming to be
 * starting, above a button offering to start it, is two contradictory claims.
 */
function useScanCopy(scanState: Readonly<Ref<ScannerState>>) {
  const viewfinderCaption = computed(() => {
    if (scanState.value === 'scanning') return 'Point the camera at a barcode'
    if (scanState.value === 'requesting') return 'Starting the camera…'
    return 'Camera paused'
  })

  /** The alert that ends the tab when Tucker can't open a camera at all. */
  const cameraAlert = computed(() => {
    if (scanState.value === 'denied') {
      return {
        title: 'Camera access is blocked',
        description:
          'Check needs the camera to read a barcode. Enable camera access for Tucker in your device settings, then come back.',
      }
    }
    if (scanState.value === 'unsupported') {
      return {
        title: 'Camera scanning isn’t available here',
        description:
          'Check needs a camera to read a barcode. Open Tucker on a device with one.',
      }
    }
    return null
  })

  return { viewfinderCaption, cameraAlert }
}

const scanner = useBarcodeScanner()
const {
  state: scanState,
  videoEl,
  barcode: scannedBarcode,
  stop: stopScan,
} = scanner
// On a phone the camera is fullscreen while it runs, over the page, which keeps
// only the paused viewfinder. Arriving on the tab is no tap, so it gets the
// Dialog without true fullscreen.
const { fullscreen, startFromTap } = useFullscreenScanner(scanner)
useCameraLifecycle(scanner)
const { viewfinderCaption, cameraAlert } = useScanCopy(scanState)
</script>

<template>
  <section class="flex flex-col gap-4">
    <header>
      <h1 class="text-2xl font-bold text-default">Check</h1>
    </header>
    <LoadErrorState
      :error="summaryError"
      title="Couldn't load your targets"
      @retry="refresh"
    >
      <SetupBanner :setup-complete="summary?.setupComplete" />

      <UAlert
        v-if="summary?.setupComplete && !hasBudget"
        icon="i-lucide-calculator"
        color="neutral"
        variant="subtle"
        title="Calorie tracking is off"
        description="A Check states what a product costs against your Calorie Budget and returns against your Protein Floor, and you have chosen not to have either. Turn calorie tracking on to use it."
        :actions="[{ label: 'Go to profile', to: '/profile' }]"
      />

      <template v-if="hasBudget">
        <!-- A camera Tucker can't open ends this tab: a Check has no manual
             path, because it produces nothing worth typing for (ADR 0022). -->
        <UAlert
          v-if="cameraAlert"
          icon="i-lucide-camera-off"
          color="warning"
          variant="subtle"
          :title="cameraAlert.title"
          :description="cameraAlert.description"
        />

        <!-- The viewfinder, until something is decoded. On a phone the camera
             runs in the fullscreen scanner, so this card holds no video and
             needs a height of its own for its caption and button. -->
        <div
          v-else-if="scanState !== 'decoded'"
          class="relative mx-auto w-full max-w-md overflow-hidden rounded-[20px] bg-black"
          :class="{ 'h-48': fullscreen }"
        >
          <video
            v-if="!fullscreen"
            ref="videoEl"
            class="max-h-[60vh] w-full object-cover"
            playsinline
            muted
            autoplay
            aria-hidden="true"
          ></video>
          <p
            class="absolute inset-x-0 top-3 text-center text-sm font-medium text-white drop-shadow"
          >
            {{ viewfinderCaption }}
          </p>
          <UButton
            v-if="scanState === 'idle'"
            class="absolute inset-x-0 bottom-4 mx-auto w-fit"
            color="primary"
            icon="i-lucide-scan-search"
            @click="startFromTap"
          >
            Start camera
          </UButton>
        </div>

        <!-- A decoded barcode goes straight to the lookup — there is no
             confirm step, because a Check commits to nothing. -->
        <CheckAnswer
          v-else-if="scannedBarcode"
          :barcode="scannedBarcode"
          :today="today"
          @scan-again="startFromTap"
        />

        <FullscreenScanner
          v-if="fullscreen"
          v-model:video-el="videoEl"
          :state="scanState"
          @stop="stopScan"
        />
      </template>
    </LoadErrorState>
  </section>
</template>
