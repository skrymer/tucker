import type { Locator, Page } from '@playwright/test'
import { expect, test } from './support/test'
import { pinToLocalMorning } from './support/date'
import { food } from '../test/food-fixtures'
import { bodyAndPlan } from '../test/mocks/handlers/body'
import { foodCatalog } from '../test/mocks/handlers/catalog'
import { weightOnlyProfile } from '../test/mocks/handlers/profile'

// Edit and delete on a row, measured: one colour (the muted text token, until
// hovered) and one 44px tap target wherever they appear. `rowAction.test.ts`
// sees only that every site uses RowActionButton; what that renders, only a
// browser can say.

/**
 * The colour [locator] draws in, its box, the icon it shows, and how far that
 * icon's centre sits from the box's.
 */
const drawn = (locator: Locator) =>
  locator.evaluate((el) => {
    const box = el.getBoundingClientRect()
    const icon = el.querySelector('.iconify')!
    const glyph = icon.getBoundingClientRect()
    const offCentre = (a: number, b: number) => Math.round(Math.abs(a - b))
    return {
      color: getComputedStyle(el).color,
      ring: getComputedStyle(el).boxShadow,
      width: box.width,
      height: box.height,
      icon: [...icon.classList].find((c) => c.startsWith('i-lucide:')),
      offCentre: [
        offCentre(glyph.x + glyph.width / 2, box.x + box.width / 2),
        offCentre(glyph.y + glyph.height / 2, box.y + box.height / 2),
      ],
    }
  })

/** The colour a CSS colour [token] resolves to in [page]. */
const resolved = (page: Page, token: string) =>
  page.evaluate((value) => {
    const probe = document.createElement('span')
    probe.style.color = value
    document.body.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, token)

/**
 * Hovers [locator] and expects its text and background to settle on [lit] —
 * polled, since the colours transition in.
 */
async function expectHoveredAs(
  locator: Locator,
  lit: { color: string; background: string },
) {
  await locator.hover()
  await expect
    .poll(() =>
      locator.evaluate((el) => ({
        color: getComputedStyle(el).color,
        background: getComputedStyle(el).backgroundColor,
      })),
    )
    .toEqual(lit)
}

test("draws Today's weight edit and the Weight history's edit and delete alike, muted, at 44px", async ({
  goto,
  network,
  page,
  isMobile,
}) => {
  const today = await pinToLocalMorning(page)
  network.use(
    ...bodyAndPlan({
      profile: weightOnlyProfile,
      today,
      readings: [{ id: 1, measuredOn: today, weightKg: 81.2 }],
    }),
  )

  await goto('/', { waitUntil: 'hydration' })
  const muted = await resolved(page, 'var(--ui-text-muted)')
  const tileEdit = await drawn(
    page.getByRole('button', { name: "Edit today's weight" }),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'Weight history' })
  await expect(card.getByText('81.2 kg')).toBeVisible()
  const historyEdit = card.getByRole('button', { name: /^Edit/ })
  const historyDelete = card.getByRole('button', { name: /^Delete/ })

  const expected = {
    color: muted,
    ring: 'none',
    width: 44,
    height: 44,
    offCentre: [0, 0],
  }
  expect({
    tileEdit,
    historyEdit: await drawn(historyEdit),
    historyDelete: await drawn(historyDelete),
  }).toEqual({
    tileEdit: { ...expected, icon: 'i-lucide:pencil' },
    historyEdit: { ...expected, icon: 'i-lucide:pencil' },
    historyDelete: { ...expected, icon: 'i-lucide:trash-2' },
  })

  // A touch screen has no hover, and Tailwind's `hover:` applies only where one does.
  if (isMobile) return
  const lit = {
    color: await resolved(page, 'var(--ui-text)'),
    background: await resolved(page, 'var(--ui-bg-elevated)'),
  }
  await expectHoveredAs(historyEdit, lit)
  await expectHoveredAs(historyDelete, lit)
})

test("keeps a long-named Food's edit and delete whole beside its name", async ({
  goto,
  network,
  page,
}) => {
  network.use(
    ...foodCatalog({
      foods: [
        food({
          id: 1,
          name: 'Greek style natural yoghurt with honey and toasted almonds',
          caloriesPer100g: 130,
          proteinPer100g: 6,
          referenceFoodId: 9,
          referenceFoodName: 'Yoghurt, Greek style, natural, regular fat',
        }),
      ],
    }),
  )

  await goto('/foods', { waitUntil: 'hydration' })
  const row = page.getByRole('listitem').filter({ hasText: 'Greek style' })

  expect({
    edit: (await drawn(row.getByRole('button', { name: /^Edit/ }))).width,
    delete: (await drawn(row.getByRole('button', { name: /^Delete/ }))).width,
  }).toEqual({ edit: 44, delete: 44 })
})
