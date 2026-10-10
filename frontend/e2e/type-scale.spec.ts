import type { Locator } from '@playwright/test'
import { expect, test } from './support/test'
import { food } from '../test/food-fixtures'
import { catalogOf } from '../test/mocks/handlers/foods'
import { weightMeasurements } from '../test/mocks/handlers/weight'
import { goalInProgress } from '../test/mocks/handlers/goal'
import { intakeBreakdownOf } from '../test/mocks/handlers/intake-breakdown'
import { intakeBreakdown } from '../test/intake-breakdown-fixtures'
import { pinToLocalMorning } from './support/date'

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

  const [titleType, cardType, bodyType] = await Promise.all([
    typeOf(title),
    typeOf(card),
    typeOf(page.locator('body')),
  ])
  expect(titleType).toEqual({ size: '24px', weight: '700' })
  expect(cardType).toEqual({ size: '18px', weight: '700' })
  expect(bodyType).toEqual({ size: '15px', weight: '400' })
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
  expect(
    await eyebrow.evaluate((el) => getComputedStyle(el).textTransform),
  ).toBe('uppercase')
})

test('the side nav and the style guide label their groups on the type scale', async ({
  page,
  goto,
  isMobile,
}) => {
  test.skip(isMobile, 'the side nav and its More group are desktop-only')

  await goto('/design', { waitUntil: 'hydration' })

  const navGroup = page
    .getByRole('group', { name: 'More' })
    .getByText('More', { exact: true })
  const swatchGroup = page.getByText('Primary · brand green', { exact: true })
  await expect(navGroup).toBeVisible()
  await expect(swatchGroup).toBeVisible()

  const [navType, swatchType] = await Promise.all([
    typeOf(navGroup),
    typeOf(swatchGroup),
  ])
  expect(navType).toEqual({ size: '13px', weight: '600' })
  expect(swatchType).toEqual({ size: '13px', weight: '600' })
})

test("the Intake Breakdown's total is a label beside its heading", async ({
  page,
  goto,
  network,
}) => {
  network.use(intakeBreakdownOf(intakeBreakdown({ totalCalories: 1935 })))

  await goto('/review', { waitUntil: 'hydration' })

  const total = page.getByText('1935 kcal', { exact: true })
  await expect(total).toBeVisible()

  expect(await typeOf(total)).toEqual({ size: '13px', weight: '600' })
})

test('a heading token wears the display face off a heading too', async ({
  page,
  goto,
  isMobile,
}) => {
  test.skip(isMobile, 'the wordmark sits in the desktop side nav')

  await goto('/', { waitUntil: 'hydration' })

  const wordmark = page
    .getByRole('navigation', { name: 'Primary' })
    .getByText('Tucker', { exact: true })
  await expect(wordmark).toBeVisible()

  const face = await wordmark.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(face).toContain('Nunito')
})

test('an eyebrow wears the body face whatever element carries it', async ({
  page,
  goto,
  network,
}) => {
  network.use(catalogOf([food({ id: 1, name: 'Rolled oats' })]))

  await goto('/log', { waitUntil: 'hydration' })

  // Log's eyebrows are headings, which otherwise take the display face by tag.
  const eyebrow = page.getByRole('heading', { level: 2, name: 'All foods' })
  await expect(eyebrow).toBeVisible()

  const face = await eyebrow.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(face).not.toContain('Nunito')
})

test('a stat figure wears the display face whatever element carries it', async ({
  page,
  goto,
  network,
}) => {
  const today = await pinToLocalMorning(page)
  network.use(
    ...weightMeasurements({ id: 1, measuredOn: today, weightKg: 84.2 }),
  )

  await goto('/', { waitUntil: 'hydration' })

  const figure = page.getByText('84.2 kg', { exact: true })
  await expect(figure).toBeVisible()

  const face = await figure.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(face).toContain('Nunito')
})

test("a card's headline figure wears the display face outside a ring too", async ({
  page,
  goto,
  network,
}) => {
  network.use(goalInProgress({ percentComplete: 40 }))

  await goto('/review', { waitUntil: 'hydration' })

  const figure = page.getByText('40%', { exact: true })
  await expect(figure).toBeVisible()

  const face = await figure.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(face).toContain('Nunito')
})
