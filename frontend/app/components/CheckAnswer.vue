<script setup lang="ts">
// What a Check says about one decoded barcode: the product's cost and return,
// or the failure that stopped it. It asks once, on mount — scanning again
// unmounts it, so a new barcode is always a new answer.
import type { components } from '#open-fetch-schemas/api'

type CheckResult = components['schemas']['CheckResponse']
type CheckFailure =
  | { kind: 'missed'; barcode: string }
  | { kind: 'incomplete' }
  | { kind: 'inconclusive'; barcode: string }

/** `today` is the day the page's summary was read for, so both agree. */
const props = defineProps<{ barcode: string; today: string }>()
// Stryker disable next-line all: a compiler macro must stay a top-level statement
defineEmits<{ scanAgain: [] }>()

/**
 * The three failures need opposite advice, so they are never collapsed: 404
 * everything was asked and none of it knew the product (futile to rescan), 422
 * it is known but its nutrition can never yield a Check (equally futile), 503
 * and anything else nobody could be asked at all — the one worth trying again.
 */
function failureFor(error: unknown, barcode: string): CheckFailure {
  const status = statusOf(error)
  if (status === 404) return { kind: 'missed', barcode }
  if (status === 422) return { kind: 'incomplete' }
  return { kind: 'inconclusive', barcode }
}

/**
 * `/api/check/{barcode}` composes the catalog-then-Provider chain with the
 * day's targets. A miss ends the attempt — there is no manual path here.
 */
function useCheckRequest() {
  const { $api } = useNuxtApp()
  return useAsyncAction(
    (signal: AbortSignal, code: string) =>
      $api('/api/check/{barcode}', {
        path: { barcode: code },
        query: { clientToday: props.today },
        // A barcode's resolution is dynamic — a product saved to the catalog,
        // or a Budget moved by a Weekly Review, changes the answer — so never
        // serve one from the browser cache.
        cache: 'no-store',
        // No auto-retry: ofetch retries a GET once by default and 503 is in its
        // stock retryStatusCodes, which re-adds one layer up the Provider-load
        // multiplication the backend deliberately refuses (ADR 0007) — and a
        // Check raises scan volume sharply (ADR 0022). Asking again is the
        // user's call here, on the one failure where it can help.
        retry: 0,
        signal,
      }),
    { mode: 'latest', timeoutMs: 8000 },
  )
}

/** Leaves exactly one of `check` / `failure` set once an answer arrives. */
function useCheckLookup() {
  const check = ref<CheckResult | null>(null)
  const failure = ref<CheckFailure | null>(null)
  const { busy: looking, pending: asking, run, cancel } = useCheckRequest()

  function settle(result: CheckResult | null, failed: CheckFailure | null) {
    check.value = result
    failure.value = failed
  }

  async function ask(code: string) {
    try {
      const outcome = await run(code)
      // Superseded by a newer ask, or cancelled on unmount — leave the screen
      // to whoever replaced us.
      if (outcome.status === 'superseded') return
      // Aborted on its timeout. Saying nothing here would leave a screen with
      // only a "Scan another" button.
      if (outcome.status === 'timedOut')
        settle(null, { kind: 'inconclusive', barcode: code })
      else settle(outcome.value, null)
    } catch (error) {
      settle(null, failureFor(error, code))
    }
  }

  /**
   * Re-ask about the barcode already decoded. The camera is never restarted:
   * the scan succeeded and only the round-trip after it failed. The failure
   * stays on screen meanwhile — it is what the user is reading when they tap
   * the button inside it. A miss and incomplete nutrition are permanent for
   * that product (ADR 0007), so only an Inconclusive Lookup offers it.
   */
  function retry() {
    if (failure.value?.kind === 'inconclusive')
      return ask(failure.value.barcode)
  }

  /**
   * In flight with nothing on screen to hold. A retry is not this: the failure
   * it was launched from stays put while the button inside it carries the wait.
   * Both answers are excluded because `looking` is held past the moment one
   * arrives (`minBusyMs`, so a spinner can't flicker).
   */
  const noAnswerYet = computed(
    () => looking.value && !failure.value && !check.value,
  )

  return { check, failure, asking, noAnswerYet, ask, retry, cancel }
}
const { check, failure, asking, noAnswerYet, ask, retry, cancel } =
  useCheckLookup()
void ask(props.barcode)
// `cancel()` marks the in-flight look-up superseded, so its continuation stays
// quiet rather than writing to a screen the user has moved on from.
onBeforeUnmount(cancel)

/**
 * The Inconclusive alert's own action, and the only recourse a failed Check has.
 *
 * `size: 'md'` because a UAlert action defaults to an `xs` chip — 24 px tall,
 * the bare WCAG minimum and a poor target for a thumb tapping one-handed in a
 * shop (ADR 0022), so it matches "Scan another" beneath it.
 *
 * `asking` rather than the delayed `looking`: the latter is held on past the
 * answer so spinners can't flicker, which on a *button* means a dead control for
 * the rest of that linger — and a tap in that window is the user asking again.
 */
const retryActions = computed(() => [
  {
    label: 'Try again',
    color: 'warning' as const,
    variant: 'subtle' as const,
    size: 'md' as const,
    loading: asking.value,
    onClick: retry,
  },
])
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <p v-if="noAnswerYet" class="py-12 text-sm text-muted">Looking it up…</p>

    <template v-else-if="check">
      <h2 class="text-center text-h2 text-highlighted">
        {{ formatName(check.name) }}
      </h2>
      <CheckAnalysis :check="check" />
    </template>

    <!-- Everything that could be asked was asked, and none of it knew the
         product. That is a verdict, so it is stated rather than hedged — and
         the advice is to move on, not to keep trying. -->
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
      :actions="retryActions"
    />

    <UButton
      color="primary"
      variant="subtle"
      icon="i-lucide-scan-search"
      @click="$emit('scanAgain')"
    >
      Scan another
    </UButton>
  </div>
</template>
