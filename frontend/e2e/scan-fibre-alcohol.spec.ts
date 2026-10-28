import { expect, test } from './support/test'
import { fakeBarcodeCamera } from './support/fake-camera'
import { foodCatalog } from '../test/mocks/handlers/catalog'

// A scanned product's fibre and ABV reach the Add-food form as the provider
// stated them. Only the camera hardware is faked; the real decoder reads it.

const BARCODE = '5700000000003'

test('scanning a product with fibre and ABV prefills both', async ({
  page,
  goto,
  network,
}) => {
  network.use(
    ...foodCatalog({
      candidates: [
        {
          name: 'Oatmeal Stout',
          barcode: BARCODE,
          proteinPer100g: 0.5,
          carbsPer100g: 4.6,
          fatPer100g: 0,
          fibrePer100g: 0.4,
          alcoholAbv: 5.2,
          statedEnergyKcalPer100g: 52,
          source: 'Open Food Facts',
        },
      ],
    }),
  )
  await fakeBarcodeCamera(page, BARCODE)
  await goto('/foods', { waitUntil: 'hydration' })
  await page.getByRole('button', { name: 'Add food' }).click()
  const sheet = page.getByRole('dialog', { name: 'Add food' })

  await sheet.getByRole('button', { name: 'Scan barcode' }).click()

  // The real zxing-wasm decode off the fake stream takes a moment.
  await expect(sheet.getByLabel(/^name$/i)).toHaveValue('Oatmeal Stout', {
    timeout: 20_000,
  })
  await expect(sheet.getByLabel(/fibre \/100\s*g/i)).toHaveValue('0.4')
  await expect(sheet.getByLabel(/alc % vol/i)).toHaveValue('5.2')
})
