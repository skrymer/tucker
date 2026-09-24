import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { food } from '../test/food-fixtures'

type Tag = { id: number; name: string }

/**
 * A catalog of one Food and the User's Tags, kept in step the way the backend
 * keeps them: a created Tag joins the list, and a PUT replaces what the Food
 * carries, so the re-read catalog shows the save.
 */
async function mockTaggableCatalog(page: Page, initial: Tag[] = []) {
  const known: Tag[] = [...initial]
  let carries: Tag[] = []
  const saved: number[][] = []
  const oats = () => food({ id: 1, name: 'Rolled oats', tags: carries })

  await page.route('**/api/foods', (route) => route.fulfill({ json: [oats()] }))
  await page.route('**/api/tags', async (route) => {
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: known.map((tag) => ({ ...tag, foodCount: 0 })),
      })
    const { name } = route.request().postDataJSON() as { name: string }
    const tag = { id: 100 + known.length, name: name.trim() }
    known.push(tag)
    return route.fulfill({ status: 201, json: { ...tag, foodCount: 0 } })
  })
  await page.route('**/api/foods/1/tags', async (route) => {
    const { tagIds } = route.request().postDataJSON() as { tagIds: number[] }
    saved.push(tagIds)
    carries = known.filter((tag) => tagIds.includes(tag.id))
    return route.fulfill({ json: oats() })
  })
  return { saved }
}

test('a User tags a Food from its row, and the row shows the Tag', async ({
  page,
  goto,
}) => {
  const { saved } = await mockTaggableCatalog(page)
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Tags for Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tags for Rolled oats' })
  await sheet.getByRole('combobox').fill('breakfast')
  await page.getByRole('option', { name: /breakfast/ }).click()
  await sheet.getByRole('button', { name: 'Save tags' }).click()

  await expect(sheet).toBeHidden()
  await expect(
    page.getByRole('list', { name: 'Tags on Rolled oats' }),
  ).toContainText('breakfast')
  expect(saved).toEqual([[100]])
})

test('Save stays reachable while the Tag list is open, and saves only what was chosen', async ({
  page,
  goto,
}) => {
  const { saved } = await mockTaggableCatalog(page, [
    { id: 1, name: 'breakfast' },
    { id: 2, name: 'dessert' },
    { id: 3, name: 'snack' },
  ])
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Tags for Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tags for Rolled oats' })
  await sheet.getByRole('combobox').click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await sheet
    .getByRole('button', { name: 'Save tags' })
    .click({ timeout: 3000 })

  await expect(sheet).toBeHidden()
  expect(saved).toEqual([[]])
})

test('a name entered straight after a pick is created and saved beside it', async ({
  page,
  goto,
}) => {
  const { saved } = await mockTaggableCatalog(page, [{ id: 1, name: 'snack' }])
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Tags for Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tags for Rolled oats' })
  const picker = sheet.getByRole('combobox', { name: 'Tags' })
  await picker.click()
  await page.getByRole('option', { name: 'snack' }).click()
  await expect(page.getByRole('listbox')).toBeHidden()
  // As a phone keyboard commits it: one input event, not a keystroke per letter.
  await page.keyboard.insertText('supper')
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/tags') &&
      response.request().method() === 'POST',
  )
  await picker.press('Enter')
  await created
  await sheet.getByRole('button', { name: 'Save tags' }).click()

  await expect(sheet).toBeHidden()
  expect(saved).toEqual([[1, 101]])
})

test('a row carrying six Tags shows four and a "+2" that opens its Tags', async ({
  page,
  goto,
}) => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((name, i) => ({
    id: i + 1,
    name,
  }))
  await page.route('**/api/foods', (route) =>
    route.fulfill({ json: [food({ id: 1, name: 'Rolled oats', tags: six })] }),
  )
  await page.route('**/api/tags', (route) =>
    route.fulfill({ json: six.map((tag) => ({ ...tag, foodCount: 1 })) }),
  )
  await goto('/foods', { waitUntil: 'hydration' })

  await expect(
    page
      .getByRole('list', { name: 'Tags on Rolled oats' })
      .getByRole('listitem'),
  ).toHaveText(['a', 'b', 'c', 'd', '+2'])

  await page.getByRole('button', { name: '2 more tags on Rolled oats' }).click()

  await expect(
    page.getByRole('dialog', { name: 'Tags for Rolled oats' }),
  ).toBeVisible()
})

test('Escape in the Tags field lets go of a typed name and keeps the sheet and its form', async ({
  page,
  goto,
}) => {
  await mockAddableCatalog(page)
  await goto('/foods', { waitUntil: 'hydration' })
  const { sheet, form, tags } = await fillNewFood(page)

  await tags.pressSequentially('din')
  await expect(page.getByRole('listbox')).toBeVisible()
  await tags.press('Escape')

  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(tags).toHaveValue('')
  await expect(form.getByLabel(/^name$/i)).toHaveValue('Skyr')

  // With the list already shut, Escape is refused like everywhere in a sheet,
  // whose one exit is its corner close (ADR 0017).
  await tags.press('Escape')
  await expect(sheet).toBeVisible()
  await expect(form.getByLabel(/^name$/i)).toHaveValue('Skyr')
})

/** An empty catalog whose Add sheet saves a Food, recording what it was sent. */
async function mockAddableCatalog(page: Page) {
  const created: unknown[] = []
  let tagCount = 0
  await page.route('**/api/foods', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    created.push(route.request().postDataJSON())
    return route.fulfill({ status: 201, json: food({ id: 1, name: 'Skyr' }) })
  })
  await page.route('**/api/tags', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: [] })
    const { name } = route.request().postDataJSON() as { name: string }
    tagCount += 1
    return route.fulfill({
      status: 201,
      json: { id: 100 + tagCount, name: name.trim(), foodCount: 0 },
    })
  })
  return { created }
}

async function fillNewFood(page: Page) {
  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: /add food/i })
  const form = sheet.getByRole('tabpanel', { name: 'Food' })
  await form.getByLabel(/^name$/i).fill('Skyr')
  await form.getByLabel(/protein \/100\s*g/i).fill('10')
  await form.getByLabel(/carbs \/100\s*g/i).fill('4')
  await form.getByLabel(/fat \/100\s*g/i).fill('0.2')
  await form.getByLabel(/fat \/100\s*g/i).press('Tab')
  return { sheet, form, tags: form.getByRole('combobox', { name: 'Tags' }) }
}

test('Enter in an empty Tags field neither saves the Food nor closes the sheet', async ({
  page,
  goto,
}) => {
  const { created } = await mockAddableCatalog(page)
  await goto('/foods', { waitUntil: 'hydration' })
  const { sheet, form, tags } = await fillNewFood(page)

  await tags.focus()
  await tags.press('Enter')

  await expect(sheet).toBeVisible()
  await expect(form.getByLabel(/^name$/i)).toHaveValue('Skyr')
  expect(created).toEqual([])
})

test('a name entered with the Tag list closed is created as a Tag, not a save', async ({
  page,
  goto,
}) => {
  const { created } = await mockAddableCatalog(page)
  await page.clock.install()
  await goto('/foods', { waitUntil: 'hydration' })
  const { sheet, form, tags } = await fillNewFood(page)

  await tags.pressSequentially('dinner')
  await expect(page.getByRole('listbox')).toBeVisible()
  // Closing the list empties the field 100 ms later, so a quick Enter is the
  // only one that still has a name behind it. The paused clock holds that moment.
  await page.clock.pauseAt(Date.now() + 1000)
  await form.locator('[data-slot="trailing"]').click()
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(tags).toHaveValue('dinner')
  await tags.press('Enter')
  await page.clock.resume()

  await expect(form.getByText('dinner', { exact: true })).toBeVisible()
  expect(created).toEqual([])
  await sheet.getByRole('button', { name: 'Save food' }).click()
  await expect(sheet).toBeHidden()
  expect(created).toEqual([expect.objectContaining({ tagIds: [101] })])
})
