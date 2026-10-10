import type { Locator } from '@playwright/test'
import { expect, test } from './support/test'

// The dot is drawn by CSS alone, so whether it can be seen is measured in a
// real browser: happy-dom computes no stylesheet.

async function dotOn(day: Locator) {
  return day.evaluate((cell) => {
    const dot = cell.querySelector('[data-slot="base"]')!
    const cellStyle = getComputedStyle(cell)
    return {
      dot: getComputedStyle(dot).backgroundColor,
      cell: cellStyle.backgroundColor,
      text: cellStyle.color,
    }
  })
}

test('a marked day keeps a visible dot when it is the selected day', async ({
  page,
  goto,
}) => {
  await goto('/design', { waitUntil: 'hydration' })
  const marked = page.getByRole('button', { name: 'Friday, October 9, 2026' })

  await marked.click()
  await expect(marked).toHaveAttribute('data-selected', 'true')

  // Polled: the cell eases into its selected colours.
  await expect
    .poll(() => dotOn(marked))
    .toEqual({
      dot: 'rgb(255, 255, 255)',
      cell: 'rgb(0, 193, 106)',
      text: 'rgb(255, 255, 255)',
    })
})

test('an unselected marked day keeps its primary dot', async ({
  page,
  goto,
}) => {
  await goto('/design', { waitUntil: 'hydration' })

  const unselected = await dotOn(
    page.getByRole('button', { name: 'Wednesday, October 7, 2026' }),
  )
  expect(unselected.dot).toBe('rgb(0, 193, 106)')
})
