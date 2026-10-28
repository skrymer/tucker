import { test, expect } from './support/smoke-test'
import { enterGrams, pickFoodToLog } from '../support/log-page'
import { toast } from '../support/toast'

// A drink's alcohol is typed as the ABV off its bottle, kept as grams and counted
// at 7 kcal a gram (ADR 0040). A 13% wine is 13 × 0.789 = 10.257 g /100g, so with
// its 0.1 g protein and 2.6 g carbs it reads 4 × 0.1 + 4 × 2.6 + 7 × 10.257 =
// 82.599 kcal /100g. A 150 g glass then carries about 108 kcal of alcohol and 16 of
// the rest: 124 kcal. The per-test reset wipes the seed, so there is no cleanup.
test('a 13% wine created by its ABV reopens at 13%, and a glass of it logs its alcohol', async ({
  page,
  goto,
}) => {
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Add food' }).click()
  const add = page.getByRole('dialog', { name: /add food/i })
  await expect(add).toBeVisible()
  await add.getByLabel(/^name$/i).fill('Shiraz')
  // UInputNumber commits what is typed into it, not what .fill() sets.
  for (const [label, figure] of [
    [/protein \/100\s*g/i, '0.1'],
    [/carbs \/100\s*g/i, '2.6'],
    [/fat \/100\s*g/i, '0'],
    [/^alc % vol/i, '13'],
  ] as const) {
    await add.getByLabel(label).click()
    await page.keyboard.type(figure)
  }
  await add.getByRole('button', { name: /save food/i }).click()
  await expect(add).toBeHidden()
  await expect(page.getByText('83 kcal · 0 g protein /100g')).toBeVisible()

  // Grams are stored unrounded, so the ABV it was written as comes back exact.
  await page.getByRole('button', { name: 'Edit Shiraz' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit Shiraz' })
  await expect(
    edit.getByRole('spinbutton', { name: /^Alc % vol/ }),
  ).toHaveValue('13')
  await expect(edit.getByRole('status')).toHaveText(
    '83 kcal · 0 g protein /100g',
  )
  await edit.getByRole('button', { name: 'Close' }).click()
  await expect(edit).toBeHidden()

  await goto('/log', { waitUntil: 'hydration' })
  const log = await pickFoodToLog(page, {
    section: 'All foods',
    food: 'Shiraz',
  })
  await enterGrams(page, log, 150)
  await log.getByRole('button', { name: /log entry/i }).click()
  await expect(log).toBeHidden()
  await expect(toast(page, 'Entry logged')).toContainText(
    'Shiraz — 150 g · 124 kcal · 0 g protein',
  )
})
