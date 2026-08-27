/**
 * A "Show all N" ↔ "Show less" control over a list shown capped.
 *
 * The label states both directions because an expander that only ever opens
 * strands whoever opened it; `collapse` is for the caller that must close it
 * without a press, when what it was opened over has been replaced.
 */
export function useExpander(total: MaybeRefOrGetter<number>) {
  const expanded = ref(false)
  const label = computed(() =>
    expanded.value ? 'Show less' : `Show all ${toValue(total)}`,
  )
  const toggle = () => {
    expanded.value = !expanded.value
  }
  const collapse = () => {
    expanded.value = false
  }
  return { expanded, label, toggle, collapse }
}
