import type { Locator } from '@playwright/test'
import { expect, test } from './support/test'
import { pinToLocalMorning } from './support/date'
import { bodyAndPlan } from '../test/mocks/handlers/body'
import { weightOnlyProfile } from '../test/mocks/handlers/profile'

// Edit and delete on a row, measured: one colour (the muted text token, until
// hovered) and one 44px tap target wherever they appear. `rowAction.test.ts`
// sees only that every site uses RowActionButton; what that renders, only a
// browser can say.

/** The colour [locator] draws in, and its box. */
const drawn = (locator: Locator) =>
  locator.evaluate((el) => {
    const { width, height } = el.getBoundingClientRect()
    return { color: getComputedStyle(el).color, width, height }
  })

test("draws Today's weight edit and the Weight history's edit and delete alike, muted, at 44px", async ({
  goto,
  network,
  page,
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
  const muted = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--ui-text-muted)'
    document.body.append(probe)
    return getComputedStyle(probe).color
  })
  const tileEdit = await drawn(
    page.getByRole('button', { name: "Edit today's weight" }),
  )

  await goto('/review', { waitUntil: 'hydration' })
  const card = page.getByRole('region', { name: 'Weight history' })
  await expect(card.getByText('81.2 kg')).toBeVisible()
  const historyEdit = await drawn(card.getByRole('button', { name: /^Edit/ }))
  const historyDelete = await drawn(
    card.getByRole('button', { name: /^Delete/ }),
  )

  const expected = { color: muted, width: 44, height: 44 }
  expect({ tileEdit, historyEdit, historyDelete }).toEqual({
    tileEdit: expected,
    historyEdit: expected,
    historyDelete: expected,
  })
})
