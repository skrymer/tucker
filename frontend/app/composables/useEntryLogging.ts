import type { components } from '#open-fetch-schemas/api'
import type { RelativeDay } from '~/utils/day'

type EntryResponse = components['schemas']['EntryResponse']
type BudgetProjectionResponse =
  components['schemas']['BudgetProjectionResponse']

/** A Weighed Entry as the page composes it — the day is stamped here, not there. */
type WeighedEntry = Omit<
  components['schemas']['LogWeighedEntryRequest'],
  'date' | 'clientToday'
>
type EstimatedEntry = Omit<
  components['schemas']['LogEstimatedEntryRequest'],
  'date' | 'clientToday'
>

/** An Entry with its day stamped: the date it is logged on, and the user's local today. */
type Stamped<TEntry> = TEntry & { date: string; clientToday: string }

export interface EntryLogOptions {
  /** Run after the Entry is committed — refresh whatever the page shows of it. */
  onLogged?: () => void | Promise<void>
}

/**
 * The day an Entry is logged on, stamped at submit with the user's local today
 * (ADR 0014): a page left open over midnight must log against the day it is now.
 */
function stamp<TEntry extends object>({
  day,
  ...entry
}: TEntry & { day: RelativeDay }): Stamped<TEntry> {
  const today = localToday()
  const date = day === 'tomorrow' ? localTomorrow(today) : today
  return { ...entry, date, clientToday: today } as Stamped<TEntry>
}

/**
 * The kept toast's title, read off the day the Entry landed on, not the sheet,
 * which is back on Today by the time the save answers.
 */
function loggedTitle(entry: EntryResponse, payload: { clientToday: string }) {
  return entry.loggedOn > payload.clientToday
    ? 'Logged for tomorrow'
    : 'Entry logged'
}

/**
 * Committing the Entry. Its toast is kept, and named from the response: the
 * Entry lands on Today, which is never the page that logged it, so the toast is
 * the only sign it worked (ADR 0005). One run-on line, which is all a toast has
 * room for — Today states the same name and figures, laid out over two.
 */
function useEntryCommit<TPayload extends { clientToday: string }>(
  commit: (payload: TPayload) => Promise<EntryResponse>,
  options: EntryLogOptions,
) {
  return useApiMutation(commit, {
    successTitle: loggedTitle,
    successDescription: formatEntryName,
    errorTitle: 'Could not save entry',
    onSuccess: () => options.onLogged?.(),
  })
}

/**
 * Logging one **Entry**, gated by its **Budget Projection**: `log` previews the
 * entry at the Save gesture; within budget it commits, over budget it raises a
 * `warning` instead, and the next `log` is the deliberate "Log anyway"
 * ([useBudgetGate]). `reset` clears a showing warning when the form is edited.
 *
 * The local day is stamped here, at submit, rather than carried on a form, so
 * one page's two entry kinds cannot disagree about which day it is.
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
    commit: (payload: Stamped<TEntry>) => Promise<EntryResponse>
    preview: (payload: Stamped<TEntry>) => Promise<BudgetProjectionResponse>
  },
  options: EntryLogOptions,
) {
  const { pending: saving, execute: commit } = useEntryCommit(
    endpoints.commit,
    options,
  )
  const {
    warning,
    pending: projecting,
    attempt,
    reset,
  } = useBudgetGate({ preview: endpoints.preview, commit })

  return {
    warning,
    pending: computed(() => projecting.value || saving.value),
    log: (entry: TEntry & { day: RelativeDay }) => attempt(stamp(entry)),
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
