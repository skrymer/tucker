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
    | { kind: 'inconclusive'; barcode: string }
    | null
  >(null)

  const {
    busy: looking,
    pending: asking,
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
        // ofetch retries a GET once by default, and 503 is in its stock
        // retryStatusCodes — which would silently undo the backend's own rule:
        // `OpenFoodFactsProvider` retries only fast transport failures and
        // deliberately excludes slowness, rate limits and server errors,
        // because repeating those multiplies load on a Provider that IP-bans
        // abusive callers (issue #164). A Check raises scan volume sharply
        // (ADR 0022), so re-adding that multiplication here is the last thing
        // this screen should do. Asking again is now the user's call, on the
        // one failure where it can help.
        retry: 0,
        signal,
      }),
    { mode: 'latest', timeoutMs: 8000 },
  )

  /**
   * Ask about a barcode, leaving exactly one of `check` / `failure` set. It
   * never blanks the screen first, so a caller decides whether the user watches
   * their current answer be replaced or be held.
   */
  async function ask(code: string) {
    try {
      const outcome = await run(code)
      // Superseded by a newer scan, or cleared by `reset` — leave the screen to
      // whoever replaced us.
      if (outcome.status === 'superseded') return
      // Aborted on its timeout. Saying nothing here would leave a screen with
      // only a "Scan another" button.
      if (outcome.status === 'timedOut') {
        failure.value = { kind: 'inconclusive', barcode: code }
        check.value = null
        return
      }
      check.value = outcome.value
      failure.value = null
    } catch (error) {
      // The three failures need opposite advice, so they are never collapsed:
      // 404 everything was asked and none of it knew the product (futile to
      // rescan), 422 it is known but its nutrition can never yield a Check
      // (equally futile), 503 and anything else nobody could be asked at all —
      // the one worth trying again (issue #164).
      const status = statusOf(error)
      failure.value =
        status === 404
          ? { kind: 'missed', barcode: code }
          : status === 422
            ? { kind: 'incomplete' }
            : { kind: 'inconclusive', barcode: code }
      check.value = null
    }
  }

  /** A newly decoded barcode: the previous product's answer is gone. */
  function lookup(code: string) {
    check.value = null
    failure.value = null
    return ask(code)
  }

  /**
   * Re-ask about the barcode already decoded. The camera is never restarted:
   * the scan succeeded and only the round-trip after it failed, so re-aiming a
   * phone at the package would redo the one part that worked. The failure stays
   * on screen meanwhile — it is what the user is reading when they tap the
   * button inside it. Offered for an Inconclusive Lookup alone; a miss and
   * incomplete nutrition are permanent for that product (ADR 0007).
   */
  function retry() {
    if (failure.value?.kind === 'inconclusive')
      return ask(failure.value.barcode)
  }

  function reset() {
    // `cancel()` marks the in-flight look-up superseded, so its continuation
    // stays quiet rather than writing to a screen the user has moved on from.
    cancel()
    check.value = null
    failure.value = null
  }

  /**
   * In flight with nothing on screen to hold. A first look-up is this — there
   * is no answer yet, so the screen says what it is doing. A retry is not: the
   * failure it was launched from is still the current answer, and stays put
   * while the button inside it carries the wait.
   *
   * Both answers are excluded, not just the failure. `looking` is deliberately
   * held past the moment one arrives (`minBusyMs`, so a spinner can't flicker),
   * so a screen keyed on it alone would blank to "Looking it up…" *after* a
   * successful retry had already put the product on screen.
   */
  const noAnswerYet = computed(
    () => looking.value && !failure.value && !check.value,
  )

  return { check, failure, asking, noAnswerYet, lookup, retry, reset }
}
const { check, failure, asking, noAnswerYet, lookup, retry, reset } =
  useCheckLookup()

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
          <p v-if="noAnswerYet" class="py-12 text-sm text-muted">
            Looking it up…
          </p>

          <template v-else-if="check">
            <h2 class="text-center text-lg font-bold text-highlighted">
              {{ check.name }}
            </h2>
            <CheckAnalysis :check="check" />
          </template>

          <!-- Everything that could be asked was asked, and none of it knew the
               product. That is a verdict, so it is stated rather than hedged
               (issue #164) — and the advice is to move on, not to keep trying. -->
          <UAlert
            v-else-if="failure?.kind === 'missed'"
            icon="i-lucide-search-x"
            color="neutral"
            variant="subtle"
            title="Not in the food database"
            :description="`Nothing Tucker can ask has barcode ${failure.barcode}, so another scan will come back the same. Try a different product.`"
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

          <!-- Nothing is known about the package — including whether it exists.
               The one failure here worth trying again, and the only one that must
               not read as a verdict.

               The copy names no culprit on purpose: this branch catches the
               Provider being unreachable, Tucker itself failing, and the
               connection dropping, and the user can act on none of those
               differently. Blaming the food database would be a guess, and a
               wrong one whenever it was Tucker that broke. -->
          <UAlert
            v-else-if="failure?.kind === 'inconclusive'"
            icon="i-lucide-cloud-off"
            color="warning"
            variant="subtle"
            title="Couldn't look that up"
            description="The lookup didn't get through, so Tucker can't say what this costs. Try again in a moment."
            :actions="[
              {
                label: 'Try again',
                color: 'warning',
                variant: 'subtle',
                // `asking`, not the delayed `looking`: the latter is held on
                // past the answer so spinners don't flicker, which on a button
                // means a dead control for the rest of that linger — and a tap
                // in that window is the user asking again.
                loading: asking,
                onClick: retry,
              },
            ]"
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
