import { afterEach, describe, expect, it, vi } from 'vitest'
import { metricSource } from './metricSource'

/** A browser answering [matching] media queries, and no others. */
function browserMatching(...matching: string[]) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matching.includes(query),
  }))
}

describe('where a metric was measured', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is a phone below the breakpoint where the side nav appears', () => {
    browserMatching()

    expect(metricSource('1.4.0').layout).toBe('phone')
  })

  it('is a desktop from that breakpoint on', () => {
    browserMatching('(min-width: 1024px)')

    expect(metricSource('1.4.0').layout).toBe('desktop')
  })

  it('is the installed app when it runs standalone, outside a browser tab', () => {
    browserMatching('(display-mode: standalone)')

    expect(metricSource('1.4.0').installed).toBe(true)
  })
})
