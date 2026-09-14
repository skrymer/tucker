import type { Ref } from 'vue'

/**
 * A read whose question is a *selection* the User can change — the trailing
 * window an Intake Breakdown or a Weight Timeline is asked about. Changing the
 * selection re-asks; the caller only binds it.
 *
 * The selection is read inside the fetcher rather than captured once, so a page
 * left open over midnight whose Retry is tapped at 00:03 asks about the day it is
 * now. And the mode is `latest`, not `useOptionalFetch`'s default `guard`: each
 * call asks a *different* question, so a load issued while one is in flight
 * supersedes it rather than being dropped as a repeat (ADR 0007).
 */
export function useWindowedFetch<S, T>(
  initial: S,
  fetcher: (selection: S, signal: AbortSignal) => Promise<T>,
) {
  const selection = ref(initial) as Ref<S>
  const { data, error, pending, load } = useOptionalFetch<T>(
    (signal) => fetcher(selection.value, signal),
    { mode: 'latest' },
  )

  watch(selection, load)
  return { selection, data, error, pending, load }
}
