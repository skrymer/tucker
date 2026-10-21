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

/**
 * One macrotask: long enough for a response the test released, or one it says
 * was never sent, to have reached the screen. Not the losing side of a race that
 * proves something does not wait: a render can need longer under load, so give
 * that side a real bound (a second) or correct code flakes red.
 */
export const settle = () => new Promise((resolve) => setTimeout(resolve))
