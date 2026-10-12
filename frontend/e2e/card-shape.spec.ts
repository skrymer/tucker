import { expect, test } from './support/test'

// The card shape, measured. The source scans in `cardShape.test.ts` see only the
// classes the app config hands every card; what they compile to, and which stock
// padding survives the merge, only a browser can say. The values are DESIGN.md's
// Shape & elevation.

test('pads every card 16px below the desktop breakpoint and 20px from it, at the card radius', async ({
  page,
  goto,
  isMobile,
}) => {
  test.skip(isMobile, 'the widths are set here, so one project covers them')

  await goto('/design', { waitUntil: 'hydration' })
  const body = page.getByText('Body', { exact: true })

  const shapeAt = async (width: number) => {
    await page.setViewportSize({ width, height: 900 })
    return body.evaluate((el) => ({
      padding: getComputedStyle(el).padding,
      radius: getComputedStyle(el.parentElement!).borderTopLeftRadius,
    }))
  }

  expect({
    phone: await shapeAt(412),
    tablet: await shapeAt(640),
    belowDesktop: await shapeAt(1023),
    desktop: await shapeAt(1024),
  }).toEqual({
    phone: { padding: '16px', radius: '20px' },
    tablet: { padding: '16px', radius: '20px' },
    belowDesktop: { padding: '16px', radius: '20px' },
    desktop: { padding: '20px', radius: '20px' },
  })
})

test('the style guide captions each shape with the value it renders', async ({
  page,
  goto,
  isMobile,
}) => {
  await goto('/design', { waitUntil: 'hydration' })

  for (const caption of [
    'Card radius · rounded-card · 20px',
    'Inset radius · rounded-inset · 12px',
    'Viewfinder radius · rounded-card · 20px',
    `Card padding · UCard · ${isMobile ? '16px' : '20px'}`,
  ]) {
    await expect(page.getByText(caption, { exact: true })).toBeVisible()
  }
})
