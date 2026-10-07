import { onScopeDispose, ref, type Ref } from 'vue'

/**
 * The user's local day (ADR 0014) as an ISO string that follows the clock: it
 * turns over at local midnight, and is re-read whenever the page becomes visible
 * again, since a backgrounded app's timers are throttled or frozen.
 */
export function useLocalDay(): Readonly<Ref<string>> {
  const day = ref(localToday())
  let timer: ReturnType<typeof setTimeout> | undefined

  function turnOverAtMidnight() {
    const now = new Date()
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    )
    timer = setTimeout(() => {
      day.value = localToday()
      turnOverAtMidnight()
    }, midnight.getTime() - now.getTime())
  }
  turnOverAtMidnight()

  const reread = () => {
    day.value = localToday()
  }
  document.addEventListener('visibilitychange', reread)

  onScopeDispose(() => {
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', reread)
  })

  return day
}
