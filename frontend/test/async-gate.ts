/**
 * Holds an answer open so a test can observe the in-flight window, and hands
 * back the release. `await gate` inside a stubbed handler; `release()` to let
 * it resolve.
 */
export function openGate() {
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return { gate, release }
}
