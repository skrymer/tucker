import { describe, expect, it } from 'vitest'
import { figureIn, releasePoints, sharedScaleMax } from './releaseTrend'

const release = (
  version: string,
  phone: { n: number; p75: number | null },
  desktop: { n: number; p75: number | null },
) => ({
  version,
  layouts: [
    { layout: 'phone' as const, ...phone },
    { layout: 'desktop' as const, ...desktop },
  ],
})

describe('releasePoints', () => {
  // A release with too few moves is a gap in its line, never a zero it would dip to.
  it("gives each release its layouts' p75, and none where a layout had too few moves", () => {
    const older = release('0.1.9', { n: 20, p75: 450 }, { n: 3, p75: null })
    const newer = release('0.1.10', { n: 0, p75: null }, { n: 12, p75: 180 })

    const points = releasePoints({ route: '/foods', releases: [older, newer] })

    expect(points).toEqual([
      { release: older, phone: 450, desktop: undefined },
      { release: newer, phone: undefined, desktop: 180 },
    ])
  })
})

describe('sharedScaleMax', () => {
  // One scale across the set, so a taller line is a slower page, not a zoomed one.
  it('is the highest p75 of any layout, release and route', () => {
    const routes = [
      {
        route: '/foods',
        releases: [release('0.1.9', { n: 20, p75: 450 }, { n: 9, p75: 300 })],
      },
      {
        route: '/review',
        releases: [
          release('0.1.9', { n: 4, p75: null }, { n: 20, p75: 1200 }),
          release('0.1.10', { n: 20, p75: 600 }, { n: 0, p75: null }),
        ],
      },
    ]

    expect(sharedScaleMax(routes)).toBe(1200)
  })

  it('is 0 where nothing was measured', () => {
    expect(sharedScaleMax([])).toBe(0)
  })
})

describe('figureIn', () => {
  it("states one layout's p75 in a release, or why it has none", () => {
    const rel = release('0.1.9', { n: 20, p75: 450 }, { n: 3, p75: null })

    expect(figureIn(rel, 'phone')).toBe('450 ms')
    expect(figureIn(rel, 'desktop')).toBe('too few (n 3)')
  })
})
