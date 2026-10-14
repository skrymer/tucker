import { expect, test } from './support/test'
import { food } from '../test/food-fixtures'
import { foodCatalog } from '../test/mocks/handlers/catalog'

/**
 * Every sheet is one ResponsiveOverlay: a bottom sheet on a phone, a centred
 * modal on desktop (ADR 0017). The shape is CSS, so it is measured here.
 */
test('a sheet opens as a bottom sheet on a phone and a centred modal on desktop', async ({
  page,
  goto,
  network,
  isMobile,
}) => {
  network.use(...foodCatalog({ foods: [food({ id: 1, name: 'Skyr' })] }))
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Edit Skyr' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Skyr' })
  await expect(sheet).toBeVisible()
  const viewport = page.viewportSize()!

  if (isMobile) {
    // It slides up from the bottom, and is anchored there edge to edge once open.
    expect(
      await sheet.evaluate((el) => getComputedStyle(el).animationName),
    ).toBe('slide-in-from-bottom')
    await expect
      .poll(
        async () =>
          (await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height,
      )
      .toBeCloseTo(viewport.height, 0)
    const box = (await sheet.boundingBox())!
    expect(box.x).toBe(0)
    expect(box.width).toBe(viewport.width)
    const corners = await sheet.evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.borderTopLeftRadius, style.borderBottomLeftRadius]
    })
    expect(corners).toEqual(['32px', '0px'])
  } else {
    // None of the phone shape: a modal no wider than its cap, clear of every edge.
    await expect.poll(async () => (await sheet.boundingBox())!.width).toBe(512)
    const box = (await sheet.boundingBox())!
    expect(box.x).toBeGreaterThan(0)
    expect(box.y).toBeGreaterThan(0)
    expect(box.y + box.height).toBeLessThan(viewport.height - 16)
    expect(
      await sheet.evaluate((el) => getComputedStyle(el).animationName),
    ).not.toBe('slide-in-from-bottom')
  }
})

test('a phone sheet slides back down as it closes', async ({
  page,
  goto,
  network,
  isMobile,
}) => {
  test.skip(!isMobile, 'the bottom sheet is the phone shape')
  network.use(...foodCatalog({ foods: [food({ id: 1, name: 'Skyr' })] }))
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Edit Skyr' }).click()
  const sheet = page.getByRole('dialog', { name: 'Edit Skyr' })
  await expect(sheet).toBeVisible()

  // Read at the moment the close starts: by the time a locator resolves the
  // sheet is gone.
  const closing = await sheet.evaluate((el) => {
    return new Promise<string>((resolve) => {
      new MutationObserver(() => {
        if (el.getAttribute('data-state') === 'closed')
          resolve(getComputedStyle(el).animationName)
      }).observe(el, { attributes: true, attributeFilter: ['data-state'] })
      ;(
        el.querySelector('button[aria-label="Close"]') as HTMLButtonElement
      ).click()
    })
  })

  expect(closing).toBe('slide-out-to-bottom')
})
