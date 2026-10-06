import type { Page } from '@playwright/test'
import { expect, test } from './support/test'
import { food, type FoodResponse } from '../test/food-fixtures'
import { foodCatalog } from '../test/mocks/handlers/catalog'

type Tag = NonNullable<FoodResponse['tags']>[number]

/** Rolled oats, carrying [tags]. */
const oats = (tags: Tag[] = []) => food({ id: 1, name: 'Rolled oats', tags })

/** The Tags a catalog row shows. */
const rowTags = (page: Page, name: string) =>
  page.getByRole('list', { name: `Tags on ${name}` }).getByRole('listitem')

/** Opens the Add sheet on a Food named "Skyr", its macros filled in. */
async function fillNewFood(page: Page) {
  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: /add food/i })
  const form = sheet.getByRole('tabpanel', { name: 'Food' })
  const name = form.getByLabel(/^name$/i)
  await name.fill('Skyr')
  await form.getByLabel(/protein \/100\s*g/i).fill('10')
  await form.getByLabel(/carbs \/100\s*g/i).fill('4')
  const fat = form.getByLabel(/fat \/100\s*g/i)
  await fat.fill('0.2')
  await fat.press('Tab')
  const tags = form.getByRole('combobox', { name: 'Tags' })
  return { sheet, form, name, tags }
}

test('a User tags a Food from its row, and the row shows the Tag', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog({ foods: [oats()] }))
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Tags for Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tags for Rolled oats' })
  await sheet.getByRole('combobox').fill('breakfast')
  await page.getByRole('option', { name: /breakfast/ }).click()
  await sheet.getByRole('button', { name: 'Save tags' }).click()

  await expect(sheet).toBeHidden()
  await expect(rowTags(page, 'Rolled oats')).toHaveText(['breakfast'])
})

test('Save stays reachable while the Tag list is open, and saves only what was chosen', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...foodCatalog({
      foods: [oats()],
      tags: [
        { id: 1, name: 'breakfast' },
        { id: 2, name: 'dessert' },
        { id: 3, name: 'snack' },
      ],
    }),
  )
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Tags for Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tags for Rolled oats' })
  await sheet.getByRole('combobox').click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await sheet
    .getByRole('button', { name: 'Save tags' })
    .click({ timeout: 3000 })

  await expect(sheet).toBeHidden()
  await expect(rowTags(page, 'Rolled oats')).toHaveCount(0)
})

test('a name entered straight after a pick is created and saved beside it', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...foodCatalog({ foods: [oats()], tags: [{ id: 1, name: 'snack' }] }),
  )
  await goto('/foods', { waitUntil: 'hydration' })

  await page.getByRole('button', { name: 'Tags for Rolled oats' }).click()
  const sheet = page.getByRole('dialog', { name: 'Tags for Rolled oats' })
  const picker = sheet.getByRole('combobox', { name: 'Tags' })
  await picker.click()
  await page.getByRole('option', { name: 'snack' }).click()
  await expect(page.getByRole('listbox')).toBeHidden()
  // As a phone keyboard commits it: one input event, not a keystroke per letter.
  await page.keyboard.insertText('supper')
  await picker.press('Enter')
  await expect(sheet.getByText('supper', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: 'Save tags' }).click()

  await expect(sheet).toBeHidden()
  await expect(rowTags(page, 'Rolled oats')).toHaveText(['snack', 'supper'])
})

test('a row carrying six Tags shows four and a "+2" that opens its Tags', async ({
  page,
  goto,
  network,
}) => {
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((name, i) => ({
    id: i + 1,
    name,
  }))
  network.use(...foodCatalog({ foods: [oats(six)] }))
  await goto('/foods', { waitUntil: 'hydration' })

  await expect(rowTags(page, 'Rolled oats')).toHaveText([
    'a',
    'b',
    'c',
    'd',
    '+2',
  ])

  await page.getByRole('button', { name: '2 more tags on Rolled oats' }).click()

  await expect(
    page.getByRole('dialog', { name: 'Tags for Rolled oats' }),
  ).toBeVisible()
})

test('Escape in the Tags field lets go of a typed name and keeps the sheet and its form', async ({
  page,
  goto,
}) => {
  await goto('/foods', { waitUntil: 'hydration' })
  const { sheet, name, tags } = await fillNewFood(page)

  await tags.pressSequentially('din')
  await expect(page.getByRole('listbox')).toBeVisible()
  await tags.press('Escape')

  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(tags).toHaveValue('')
  await expect(name).toHaveValue('Skyr')

  // With the list already shut, Escape is refused like everywhere in a sheet,
  // whose one exit is its corner close (ADR 0017).
  await tags.press('Escape')
  await expect(sheet).toBeVisible()
  await expect(name).toHaveValue('Skyr')
})

test('Enter in an empty Tags field neither saves the Food nor closes the sheet', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog())
  await goto('/foods', { waitUntil: 'hydration' })
  const { sheet, name, tags } = await fillNewFood(page)

  await tags.focus()
  await tags.press('Enter')

  // A save closes the sheet onto the catalog, so a sheet still open on the
  // same form is one that saved nothing.
  await expect(sheet).toBeVisible()
  await expect(name).toHaveValue('Skyr')
})

test('spaces entered with the Tag list closed create no Tag', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog())
  await page.clock.install()
  await goto('/foods', { waitUntil: 'hydration' })
  const { sheet, form, tags } = await fillNewFood(page)

  await tags.pressSequentially('   ')
  await expect(page.getByRole('listbox')).toBeVisible()
  // Held in the moment before closing the list empties the field, as below.
  await page.clock.pauseAt(Date.now() + 1000)
  await form.locator('[data-slot="trailing"]').click()
  await expect(page.getByRole('listbox')).toBeHidden()
  await expect(tags).toHaveValue('   ')
  await tags.press('Enter')
  await page.clock.resume()

  await expect(tags).toHaveValue('')
  // Sent, the spaces would have been refused in the server's words — and Save
  // waits while a Tag is being created, so an enabled Save means none is.
  const save = sheet.getByRole('button', { name: 'Save food' })
  await expect(save).toBeEnabled()
  await expect(sheet.getByText(/must not be blank/)).toHaveCount(0)
  await save.click()
  await expect(sheet).toBeHidden()
  await expect(page.getByRole('main').getByText('Skyr')).toBeVisible()
  await expect(rowTags(page, 'Skyr')).toHaveCount(0)
})

test('a name entered with the Tag list closed is created as a Tag, not a save', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog())
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
  // Not saved: a save would have closed the sheet onto the catalog.
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Save food' }).click()
  await expect(sheet).toBeHidden()
  await expect(rowTags(page, 'Skyr')).toHaveText(['dinner'])
})

test('a name entered in Manage tags with Enter becomes a Tag, leaving the field empty and uncomplaining', async ({
  page,
  goto,
  network,
}) => {
  network.use(...foodCatalog({ foods: [oats()] }))
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Manage tags' }).click()
  const sheet = page.getByRole('dialog', { name: 'Manage tags' })
  const field = sheet.getByRole('textbox', { name: 'New tag' })

  await field.fill('Lunch')
  await field.press('Enter')
  // As a phone's keyboard does when its Go key submits: the field lets go.
  await field.blur()

  await expect(sheet.getByRole('listitem')).toHaveText([/Lunch/])
  await expect(field).toHaveValue('')
  // An absence has nothing to wait for. UForm debounces input validation by 300 ms
  // unless told otherwise, and that late validation is what complained, so the
  // check outlasts it.
  await page.waitForTimeout(500)
  await expect(sheet.getByText('Enter a name for this tag')).toHaveCount(0)
})

test('Manage tags lists every Tag with its Food count, and deleting one takes it off the row', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...foodCatalog({
      foods: [oats([{ id: 2, name: 'snack' }])],
      tags: [{ id: 1, name: 'breakfast' }],
    }),
  )
  await goto('/foods', { waitUntil: 'hydration' })
  const row = page.getByRole('listitem').filter({ hasText: 'Rolled oats' })
  await expect(row.getByText('snack')).toBeVisible()

  await page.getByRole('button', { name: 'Manage tags' }).click()
  const sheet = page.getByRole('dialog', { name: 'Manage tags' })
  await expect(sheet.getByRole('list')).toMatchAriaSnapshot(`
    - list:
      - /children: deep-equal
      - listitem:
        - text: breakfast 0 foods
        - button "Rename breakfast"
        - button "Delete breakfast"
      - listitem:
        - text: snack 1 food
        - button "Rename snack"
        - button "Delete snack"
  `)
  await sheet.getByRole('button', { name: 'Delete snack' }).click()
  await expect(
    sheet.getByText(
      'Delete “snack”? It comes off 1 food. The foods stay in your catalog.',
    ),
  ).toBeVisible()
  await sheet.getByRole('button', { name: 'Delete tag' }).click()

  await expect(sheet.getByRole('list')).toMatchAriaSnapshot(`
    - list:
      - /children: deep-equal
      - listitem:
        - text: breakfast 0 foods
        - button "Rename breakfast"
        - button "Delete breakfast"
  `)
  await sheet.getByRole('button', { name: 'Close' }).click()
  await expect(row).toBeVisible()
  await expect(row.getByText('snack')).toHaveCount(0)
})
