import { describe, expect, it } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import RingGauge from './RingGauge.vue'

// The gauge is decorative by design (DESIGN.md): the SVG is `aria-hidden` and the
// legend beside it is the accessible equivalent, so there is no accessible
// surface to query. Its arcs are still Tucker's signature, and the alternative to
// reading the circles is leaving them unasserted — which is how a ring that draws
// nothing at all would ship green.
const circles = (container: Element) =>
  Array.from(container.querySelectorAll('circle'))

const OUTER = { radius: 72, stroke: 'var(--ui-primary)' }
const INNER = { radius: 52, stroke: 'var(--ui-secondary)' }

describe('RingGauge', () => {
  it('draws a track and a swept arc for every arc it is given', async () => {
    const { container } = await renderSuspended(RingGauge, {
      props: {
        arcs: [
          { ...OUTER, consumed: 1, target: 2 },
          { ...INNER, consumed: 1, target: 2 },
        ],
      },
    })

    expect(circles(container)).toHaveLength(4)
    expect(circles(container).map((c) => c.getAttribute('r'))).toEqual([
      '72',
      '72',
      '52',
      '52',
    ])
  })

  it('sweeps each arc to its own filled fraction', async () => {
    const { container } = await renderSuspended(RingGauge, {
      props: {
        arcs: [
          { ...OUTER, consumed: 1, target: 2 },
          { ...INNER, consumed: 2, target: 2 },
        ],
      },
    })

    const [, half, , full] = circles(container)
    // Half filled leaves half the circumference as offset; a full arc leaves none.
    expect(Number(half!.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      Math.PI * 72,
      6,
    )
    // The string, not `Number(...)`: `Number(null)` is 0, so a lost binding
    // would satisfy the numeric form.
    expect(full!.getAttribute('stroke-dashoffset')).toBe('0')
  })

  it('draws each arc over a tint of its own colour', async () => {
    const { container } = await renderSuspended(RingGauge, {
      props: { arcs: [{ ...OUTER, consumed: 1, target: 2 }] },
    })

    const [track, arc] = circles(container)
    expect(arc!.getAttribute('stroke')).toBe('var(--ui-primary)')
    expect(track!.getAttribute('stroke')).toBe(
      'color-mix(in srgb, var(--ui-primary) 15%, transparent)',
    )
  })

  it('draws every ring at one geometry, whatever it is asked to show', async () => {
    // DESIGN.md's two-ring rule — the Day Ring and the Goal ring are peers, and
    // sizing one down would rank weight against calories. Owning the numbers here
    // is what makes that true by construction rather than by convention.
    const { container } = await renderSuspended(RingGauge, {
      props: { arcs: [{ ...OUTER, consumed: 1, target: 2 }] },
    })

    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('160')
    expect(svg.getAttribute('height')).toBe('160')
    expect(svg.getAttribute('viewBox')).toBe('0 0 176 176')
    expect(circles(container)[0]!.getAttribute('stroke-width')).toBe('15')
  })
})
