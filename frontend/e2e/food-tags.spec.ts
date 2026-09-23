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
