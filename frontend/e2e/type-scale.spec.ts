import type { Locator } from '@playwright/test'
import { expect, test } from './support/test'
import { food } from '../test/food-fixtures'
import { catalogOf } from '../test/mocks/handlers/foods'

// The type tokens, measured. The source scans in `typeScale.test.ts` see only
// class names, so a token that fails to compile — a misspelt `@theme` key, a
// class Tailwind never generates — would pass them and render at the browser's
// default. The values are DESIGN.md's Typography → Scale.

async function typeOf(locator: Locator) {
  return locator.evaluate((el) => {
    const style = getComputedStyle(el)
    return { size: style.fontSize, weight: style.fontWeight }
  })
}

test('Today renders its page title, card heading and body text on the type scale', async ({
  page,
  goto,
}) => {
  await goto('/', { waitUntil: 'hydration' })

  const title = page.getByRole('heading', { level: 1, name: 'Today' })
  const card = page.getByRole('heading', { level: 2, name: "Today's weight" })
  await expect(title).toBeVisible()
  await expect(card).toBeVisible()

  expect(await typeOf(title)).toEqual({ size: '24px', weight: '700' })
  expect(await typeOf(card)).toEqual({ size: '18px', weight: '700' })
  expect(await typeOf(page.locator('body'))).toEqual({
    size: '15px',
    weight: '400',
  })
})

test('Log renders its section eyebrow on the type scale', async ({
  page,
  goto,
  network,
}) => {
  network.use(catalogOf([food({ id: 1, name: 'Rolled oats' })]))

  await goto('/log', { waitUntil: 'hydration' })

  const eyebrow = page.getByRole('heading', { level: 2, name: 'All foods' })
  await expect(eyebrow).toBeVisible()

  expect(await typeOf(eyebrow)).toEqual({ size: '11.5px', weight: '650' })
})
