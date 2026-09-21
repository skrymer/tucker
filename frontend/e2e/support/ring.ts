import type { Locator, Page } from '@playwright/test'

/**
 * The gauges a page draws, in DOM order. A ring is the only SVG that sweeps
 * arcs, so it is found by those rather than by its viewBox — a viewBox selector
 * silently stops matching the day the geometry moves, while the ring still
 * renders.
 */
export function rings(page: Page): Locator {
  return page.getByRole('main').locator('svg:has(circle[stroke-dashoffset])')
}

/** The donut hole's diameter as [ring] actually drew it, in CSS px. */
export async function drawnHoleDiameter(ring: Locator) {
  return ring.evaluate((svg) => {
    const circles = [...svg.querySelectorAll('circle')]
    const innermost = circles.reduce((a, b) =>
      Number(a.getAttribute('r')) <= Number(b.getAttribute('r')) ? a : b,
    )
    const viewBoxWidth = Number(svg.getAttribute('viewBox')!.split(' ')[2])
    const scale = svg.getBoundingClientRect().width / viewBoxWidth
    const stroke = Number(innermost.getAttribute('stroke-width')) * scale
    // A circle's client rect is its *geometry* box — 2r, stroke excluded — and
    // the stroke straddles it, so the hole is 2r less half a stroke each side.
    return innermost.getBoundingClientRect().width - stroke
  })
}

/**
 * A centre figure's true glyph width. Its own box is the grid track it sits in,
 * so the box reports the constraint rather than what was drawn inside it.
 */
export async function inkWidth(figure: Locator) {
  return figure.evaluate((el) => {
    const range = document.createRange()
    range.selectNodeContents(el)
    return range.getBoundingClientRect().width
  })
}
