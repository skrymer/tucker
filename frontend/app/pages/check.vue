<script setup lang="ts">
// A Check (ADR 0022): scan a package to see what it costs and returns against
// the whole day's targets, before buying or eating it. Nothing is created — no
// Food, no Entry — and the camera is the only way in. That narrows nothing in
// the Add-Food flow, where manual barcode and macro entry stay always-on peers
// (ADR 0006); the difference is that a Check produces nothing worth typing for.
import type { components } from '#open-fetch-schemas/api'

type CheckResult = components['schemas']['CheckResponse']

const today = localToday()
const { $api } = useNuxtApp()

// The summary supplies the setup gate's Calorie Budget, and reading it is also
// what advances the weekly cadence (ADR 0010) — a Check computes nothing itself.
const {
  data: summary,
  error: summaryError,
  refresh,
} = await useApi('/api/summary', { query: { date: today } })

// Every figure a Check states is a share of the Budget or the Floor. Without one
// there is no denominator, and inventing it would state confident nonsense about
// a product the user is deciding to buy (ADR 0022).
const hasBudget = computed(() => summary.value?.calorieBudget != null)

/**
 * The lookup half: a decoded barcode resolves through `/api/check/{barcode}`,
 * which composes the catalog-then-Provider chain with the day's targets. A miss
 * ends the attempt — there is no manual path to fall back to here.
 */
function useCheckLookup() {
  const check = ref<CheckResult | null>(null)
  const failure = ref<
    | { kind: 'missed'; barcode: string }
    | { kind: 'incomplete' }
    | { kind: 'unavailable' }
    | null
  >(null)

  const {
    busy: looking,
    run,
    cancel,
  } = useAsyncAction(
    (signal: AbortSignal, code: string) =>
      $api('/api/check/{barcode}', {
        path: { barcode: code },
        // A barcode's resolution is dynamic — a product saved to the catalog,
        // or a Budget moved by a Weekly Review, changes the answer — so never
        // serve one from the browser cache.
        cache: 'no-store',
        signal,
      }),
    { mode: 'latest', timeoutMs: 8000 },
  )

  // Only the newest lookup may write to the screen. `useAsyncAction` returns
  // undefined for a supersede and for a timeout alike, and the two need opposite
  // treatment — say nothing, versus say the lookup failed — so the generation is
  // tracked here rather than inferred.
  let generation = 0

  async function lookup(code: string) {
    const mine = ++generation
    check.value = null
    failure.value = null
    try {
      const result = await run(code)
      // Superseded by a newer scan or cleared by `reset` — leave the screen to
      // whoever replaced us.
      if (mine !== generation) return
      // Still current but empty: the request was aborted on its timeout. Saying
      // nothing here would leave a screen with only a "Scan another" button.
      if (!result) {
        failure.value = { kind: 'unavailable' }
        return
      }
      check.value = result
    } catch (error) {
      if (mine !== generation) return
      // The three failures need opposite advice, so they are never collapsed:
      // 404 nothing came back, 422 the product is known but its nutrition can
      // never yield a Check (rescanning is futile), anything else transient.
      const status = (error as { status?: number })?.status
      failure.value =
        status === 404
          ? { kind: 'missed', barcode: code }
          : status === 422
            ? { kind: 'incomplete' }
            : { kind: 'unavailable' }
    }
  }

  function reset() {
    generation++
    cancel()
    check.value = null
    failure.value = null
  }

  return { check, failure, looking, lookup, reset }
}
const { check, failure, looking, lookup, reset } = useCheckLookup()

/**
 * The screen is the camera: opening the tab starts it, and scanning again after
 * a result restarts it. A denied or absent camera ends the tab with no degraded
 * mode — the accepted trade for keeping a Check a two-second interaction.
 */
function useScanSurface() {
  const {
    state: scanState,
    videoEl,
    barcode: scannedBarcode,
    start: startScan,
    stop: stopScan,
  } = useBarcodeScanner()

  // A decoded barcode goes straight to the lookup — there is no confirm step,
  // because a Check commits to nothing.
  watch(scannedBarcode, (code) => {
    if (code) lookup(code)
  })

  /** Start only when there is a Budget to measure against and nothing on screen. */
  function startIfReady() {
    if (hasBudget.value && scanState.value === 'idle') startScan()
  }

  onMounted(() => {
    // Warm the WASM decoder alongside the camera permission rather than after
    // it: the two depend on nothing of each other, and a Check is meant to be a
    // two-second interaction.
    if (hasBudget.value) void import('zxing-wasm/reader')
    startIfReady()
  })
  // A failed summary load leaves no Budget and so no scanner; retrying it must
  // bring the camera up rather than leave a viewfinder that never starts.
  watch(hasBudget, startIfReady)
  // The composable releases the camera when the app is backgrounded, which on a
  // phone is one app-switch away — and this screen is used in a shop. Bring it
  // back on return, or the tab is a dead black box until the user finds a button.
  function onVisible() {
    if (document.visibilityState === 'visible') startIfReady()
  }
  document.addEventListener('visibilitychange', onVisible)
  // Leaving the tab must release the camera; the composable also drops it on
  // page-hide and visibility loss, but a client-side route change is neither.
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    stopScan()
  })

  function scanAgain() {
    reset()
    startScan()
  }

  // Each state says what is actually true — an idle viewfinder claiming to be
  // starting, above a button offering to start it, is two contradictory claims.
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

  return {
    scanState,
    videoEl,
    startScan,
    scanAgain,
    cameraAlert,
    viewfinderCaption,
  }
}
const {
  scanState,
  videoEl,
  startScan,
  scanAgain,
  cameraAlert,
  viewfinderCaption,
} = useScanSurface()
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
      <SetupBanner :calorie-budget="summary?.calorieBudget" />

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

        <!-- The viewfinder, until something is decoded. -->
        <div
          v-else-if="scanState !== 'decoded'"
          class="relative mx-auto w-full max-w-md overflow-hidden rounded-[20px] bg-black"
        >
          <video
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
            @click="startScan"
          >
            Start camera
          </UButton>
        </div>

        <div v-else class="flex flex-col items-center gap-4">
          <p v-if="looking" class="py-12 text-sm text-muted">Looking it up…</p>

          <template v-else-if="check">
            <h2 class="text-center text-lg font-bold text-highlighted">
              {{ check.name }}
            </h2>
            <p class="-mt-3 text-xs text-dimmed">per 100 g</p>
            <CheckAnalysis :check="check" />
          </template>

          <!-- Until #164 a Provider outage and a genuine miss arrive the same
               way, so this says what is true of both rather than asserting the
               product doesn't exist. -->
          <UAlert
            v-else-if="failure?.kind === 'missed'"
            icon="i-lucide-search-x"
            color="neutral"
            variant="subtle"
            title="Nothing came back"
            :description="`Tucker found no match for barcode ${failure.barcode}. Try scanning it again, or check a different product.`"
          />

          <!-- The product is known but will never have derivable calories, so
               "try again" would send the user round a loop that cannot end. -->
          <UAlert
            v-else-if="failure?.kind === 'incomplete'"
            icon="i-lucide-file-question"
            color="neutral"
            variant="subtle"
            title="Not enough nutrition information"
            description="The source knows this product but not all of its macros, so Tucker can't say what it costs. Scanning it again won't help."
          />

          <UAlert
            v-else-if="failure"
            icon="i-lucide-cloud-off"
            color="warning"
            variant="subtle"
            title="Couldn't check that right now"
            description="Tucker couldn't reach your targets to measure it against. Try scanning it again in a moment."
          />

          <UButton
            color="primary"
            variant="subtle"
            icon="i-lucide-scan-search"
            @click="scanAgain"
          >
            Scan another
          </UButton>
        </div>
      </template>
    </LoadErrorState>
  </section>
</template>
