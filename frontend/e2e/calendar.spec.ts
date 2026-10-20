import type { Locator } from '@playwright/test'
import { expect, test } from './support/test'

// The marks are drawn by CSS alone, so whether they can be seen is measured in a
// real browser: happy-dom computes no stylesheet. A ring is a box-shadow and a
// dot a background, each read off the mark itself.

/** The colour a ring paints: the one opaque layer of its box-shadow. */
function ringColour(boxShadow: string) {
  return (
    boxShadow
      .match(/rgba?\([^)]*\)/g)
      ?.find((colour) => colour !== 'rgba(0, 0, 0, 0)') ?? null
  )
}

async function marksOn(day: Locator) {
  const drawn = await day.evaluate((cell) => {
    const style = (mark: string) => {
      const el = cell.querySelector(`[data-mark="${mark}"]`)
      return el && getComputedStyle(el)
    }
    const cellStyle = getComputedStyle(cell)
    return {
      ring: style('weigh-in')?.boxShadow ?? null,
      dot: style('entries')?.backgroundColor ?? null,
      cell: cellStyle.backgroundColor,
      text: cellStyle.color,
    }
  })
  return { ...drawn, ring: drawn.ring && ringColour(drawn.ring) }
}

test('a marked day keeps both marks visible when it is the selected day', async ({
  page,
  goto,
}) => {
  await goto('/design', { waitUntil: 'hydration' })
  const both = page.getByRole('button', { name: 'Friday, October 9, 2026' })

  await both.click()
  await expect(both).toHaveAttribute('data-selected', 'true')

  // Polled: the cell eases into its selected colours.
  await expect
    .poll(() => marksOn(both))
    .toEqual({
      ring: 'rgb(255, 255, 255)',
      dot: 'rgb(255, 255, 255)',
      cell: 'rgb(0, 193, 106)',
      text: 'rgb(255, 255, 255)',
    })
})

test("a day that can't be picked dims its marks with its numeral", async ({
  page,
  goto,
}) => {
  await goto('/design', { waitUntil: 'hydration' })

  const disabled = await marksOn(
    page.getByRole('button', { name: 'Sunday, October 25, 2026' }),
  )
  expect([disabled.ring, disabled.dot]).toEqual([disabled.text, disabled.text])
  expect(disabled.text).not.toBe('rgb(0, 193, 106)')
})

test("the legend's swatches are drawn as the marks are", async ({
  page,
  goto,
}) => {
  await goto('/design', { waitUntil: 'hydration' })

  const swatches = await page
    .getByTestId('calendar-legend')
    .locator('span > span')
    .evaluateAll((spans) =>
      spans.map((span) => ({
        shadow: getComputedStyle(span).boxShadow,
        fill: getComputedStyle(span).backgroundColor,
        width: getComputedStyle(span).width,
      })),
    )
  const marks = await page
    .getByRole('button', { name: 'Monday, October 5, 2026' })
    .locator('[data-mark]')
    .evaluateAll((els) =>
      els.map((el) => ({
        shadow: getComputedStyle(el).boxShadow,
        fill: getComputedStyle(el).backgroundColor,
        width: getComputedStyle(el).width,
      })),
    )
  // The legend reads Entries then Weigh-in; the cell draws the ring first.
  expect(swatches).toEqual([marks[1], marks[0]])
  expect(swatches.map((swatch) => ringColour(swatch.shadow))).toEqual([
    null,
    'rgb(0, 193, 106)',
  ])
})
