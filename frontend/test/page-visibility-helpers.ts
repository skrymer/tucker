import { vi } from 'vitest'

// Shared browser-boundary stubs for the scanner's tests: the Fullscreen API
// (Android Chrome's true fullscreen; iPhone WebKit has none) and the page's
// visibility as the app is backgrounded. jsdom implements neither, so every
// test drives the same fakes rather than each redefining them. Call
// `resetPageStubs()` in an `afterEach` of any file that uses them.

/** A browser with element fullscreen; returns its request. */
export function stubTrueFullscreen(
  request: () => Promise<void> = async () => {},
) {
  const requestFullscreen = vi.fn(request)
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    value: requestFullscreen,
    configurable: true,
  })
  return requestFullscreen
}

/** Puts the page in true fullscreen ([element]) or out of it (`null`). */
export function setFullscreenElement(element: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    value: element,
    configurable: true,
  })
}

/** Stubs leaving fullscreen; returns the stub. */
export function stubExitFullscreen() {
  const exitFullscreen = vi.fn(async () => {})
  Object.defineProperty(document, 'exitFullscreen', {
    value: exitFullscreen,
    configurable: true,
  })
  return exitFullscreen
}

/** The app goes to the background, or comes back from it. */
export function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    value: state,
    configurable: true,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

export function resetPageStubs() {
  Reflect.deleteProperty(document.documentElement, 'requestFullscreen')
  for (const key of ['fullscreenElement', 'exitFullscreen', 'visibilityState'])
    Reflect.deleteProperty(document, key)
}
