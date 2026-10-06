import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import {
  resetPageStubs,
  setFullscreenElement,
  stubExitFullscreen,
  stubTrueFullscreen,
} from '~~/test/page-visibility-helpers'
import { useFullscreenScanner } from './useFullscreenScanner'

// The viewport is a live ref so a test can move it mid-scan, as true fullscreen
// does to a desktop browser's window.
const viewport = await vi.hoisted(async () => {
  const { ref } = await import('vue')
  return { desktop: ref(false) }
})
mockNuxtImport('useIsDesktop', () => () => viewport.desktop)

beforeEach(() => {
  viewport.desktop.value = false
})
afterEach(() => {
  resetPageStubs()
})

/** Runs the composable in its own scope, as a component's setup would. */
function withScanner(open = false) {
  const scanner = { open: ref(open), start: vi.fn(), stop: vi.fn() }
  const scope = effectScope()
  const surface = scope.run(() => useFullscreenScanner(scanner))!
  return { scanner, surface, scope }
}

describe('useFullscreenScanner', () => {
  it('presents the scanner fullscreen on a phone', () => {
    const { surface, scope } = withScanner()

    expect(surface.fullscreen.value).toBe(true)
    scope.stop()
  })

  it('keeps its presentation for as long as the scanner is open', async () => {
    // True fullscreen widens a desktop browser's window past the phone
    // breakpoint; the scanner it was opened for must not switch under it.
    const { scanner, surface, scope } = withScanner(true)

    viewport.desktop.value = true
    await nextTick()
    expect(surface.fullscreen.value).toBe(true)

    scanner.open.value = false
    await nextTick()
    expect(surface.fullscreen.value).toBe(false)
    scope.stop()
  })

  it('asks for true fullscreen from a tap on a phone, and starts the scanner', () => {
    const requestFullscreen = stubTrueFullscreen()
    const { scanner, surface, scope } = withScanner()

    surface.startFromTap()

    expect(requestFullscreen).toHaveBeenCalledOnce()
    expect(scanner.start).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('starts a desktop scanner inline, never asking for fullscreen', () => {
    viewport.desktop.value = true
    const requestFullscreen = stubTrueFullscreen()
    const { scanner, surface, scope } = withScanner()

    surface.startFromTap()

    expect(requestFullscreen).not.toHaveBeenCalled()
    expect(scanner.start).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('starts the scanner where the browser has no element fullscreen', () => {
    // iPhone WebKit, where the scanner's Dialog is the whole answer.
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      value: undefined,
      configurable: true,
    })
    const { scanner, surface, scope } = withScanner()

    surface.startFromTap()

    expect(scanner.start).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('stops an open scanner when the system takes the page out of fullscreen', () => {
    // Android's back gesture leaves fullscreen without the app asking.
    const { scanner, scope } = withScanner(true)

    setFullscreenElement(null)
    document.dispatchEvent(new Event('fullscreenchange'))

    expect(scanner.stop).toHaveBeenCalledOnce()
    scope.stop()
  })

  it('keeps scanning as the page enters fullscreen', () => {
    const { scanner, scope } = withScanner(true)

    setFullscreenElement(document.documentElement)
    document.dispatchEvent(new Event('fullscreenchange'))

    expect(scanner.stop).not.toHaveBeenCalled()
    scope.stop()
  })

  it('ignores leaving fullscreen once the scanner has closed', () => {
    // Its own exit on closing fires the same event. A stop then would turn a
    // denied camera's alert back into an idle scanner.
    const { scanner, scope } = withScanner(false)

    setFullscreenElement(null)
    document.dispatchEvent(new Event('fullscreenchange'))

    expect(scanner.stop).not.toHaveBeenCalled()
    scope.stop()
  })

  it('stops listening once its surface is gone', () => {
    const { scanner, scope } = withScanner(true)
    scope.stop()

    setFullscreenElement(null)
    document.dispatchEvent(new Event('fullscreenchange'))

    expect(scanner.stop).not.toHaveBeenCalled()
  })

  it('leaves fullscreen when the scanner closes', async () => {
    const exitFullscreen = stubExitFullscreen()
    setFullscreenElement(document.documentElement)
    const { scanner, scope } = withScanner(true)

    scanner.open.value = false
    await nextTick()

    expect(exitFullscreen).toHaveBeenCalledOnce()
    scope.stop()
  })
})
