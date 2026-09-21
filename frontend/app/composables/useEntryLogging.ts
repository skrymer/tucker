import type { components } from '#open-fetch-schemas/api'

type EntryResponse = components['schemas']['EntryResponse']
type BudgetProjectionResponse =
  components['schemas']['BudgetProjectionResponse']

/** A Weighed Entry as the page composes it — the day is stamped here, not there. */
type WeighedEntry = Omit<
  components['schemas']['LogWeighedEntryRequest'],
  'date'
>
type EstimatedEntry = Omit<
  components['schemas']['LogEstimatedEntryRequest'],
  'date'
>

export interface EntryLogOptions {
  /** Run after the Entry is committed — refresh whatever the page shows of it. */
  onLogged?: () => void | Promise<void>
}

/**
 * Logging one **Entry**, gated by its **Budget Projection**: `log` previews the
 * entry at the Save gesture; within budget it commits, over budget it raises a
 * `warning` instead, and the next `log` is the deliberate "Log anyway"
 * ([useBudgetGate]). `reset` clears a showing warning when the form is edited.
 *
 * The local day is stamped here, at submit, rather than carried on a form
 * (ADR 0014): a page left open over midnight must log against the day it is now,
 * and one page's two entry kinds must not disagree about which day that is.
 *
 * The two endpoints arrive as typed callers rather than as a path built from a
 * kind — a template-literal path is a string to `nuxt-open-fetch`, so deriving
 * one would trade the generated request and response types for a cast.
 *
 * It stays a shared composable on one consumer: this is the single home of the
 * gate, which is what makes "every Entry carries a Budget Projection" (ADR 0028)
 * checkable by looking in one place rather than at every page.
 */
function useGatedEntryLog<TEntry extends object>(
  endpoints: {
    commit: (payload: TEntry & { date: string }) => Promise<EntryResponse>
    preview: (
      payload: TEntry & { date: string },
    ) => Promise<BudgetProjectionResponse>
  },
  options: EntryLogOptions,
) {
  type Payload = TEntry & { date: string }

  const { pending: saving, execute: commit } = useApiMutation(
    endpoints.commit,
    {
      // Kept, and named from the response: the Entry lands on Today, which is
      // never the page that logged it, so the toast is the only sign it worked
      // (ADR 0005). One run-on line, which is all a toast has room for — Today
      // states the same name and figures, laid out over two.
      successTitle: 'Entry logged',
      successDescription: formatEntryName,
      errorTitle: 'Could not save entry',
      onSuccess: () => options.onLogged?.(),
    },
  )

  const {
    warning,
    pending: projecting,
    attempt,
    reset,
  } = useBudgetGate<Payload>({ preview: endpoints.preview, commit })

  return {
    warning,
    pending: computed(() => projecting.value || saving.value),
    log: (entry: TEntry) =>
      attempt({ ...entry, date: localToday() } as Payload),
    reset,
  }
}

/** Logging a Weighed Entry — a Food, and the grams weighed of it. */
export function useWeighedEntryLog(options: EntryLogOptions = {}) {
  const { $api } = useNuxtApp()
  return useGatedEntryLog<WeighedEntry>(
    {
      commit: (body) => $api('/api/entries/weighed', { method: 'POST', body }),
      preview: (body) =>
        $api('/api/entries/weighed/preview', { method: 'POST', body }),
    },
    options,
  )
}

/** Logging an Estimated Entry — a label and a guess, with no Food behind it. */
export function useEstimatedEntryLog(options: EntryLogOptions = {}) {
  const { $api } = useNuxtApp()
  return useGatedEntryLog<EstimatedEntry>(
    {
      commit: (body) =>
        $api('/api/entries/estimated', { method: 'POST', body }),
      preview: (body) =>
        $api('/api/entries/estimated/preview', { method: 'POST', body }),
    },
    options,
  )
}
