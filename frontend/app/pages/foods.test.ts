import { describe, expect, it, vi } from 'vitest'
import {
  mockNuxtImport,
  registerEndpoint,
  renderSuspended,
} from '@nuxt/test-utils/runtime'
import { createError, setResponseStatus } from 'h3'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { food } from '~~/test/food-fixtures'
import Foods from './foods.vue'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

const oats = food({
  id: 7,
  name: 'Oats',
  caloriesPer100g: 380,
  proteinPer100g: 13,
})

registerEndpoint('/api/foods', () => [oats])

// The backend rejects deleting a Food that has logged Entries with a 400 whose
// `{ message }` names the Food (issue #107). Mirror that exact shape.
const rejection = "Oats has logged Entries and can't be deleted."
registerEndpoint('/api/foods/7', {
  method: 'DELETE',
  handler: (event) => {
    setResponseStatus(event, 400)
    return { message: rejection }
  },
})

describe('/foods deleting a food with logged entries', () => {
  it('surfaces the rule message with no Retry and keeps the food listed', async () => {
    toastAdd.mockClear()
    await renderSuspended(Foods)

    await userEvent.click(screen.getByRole('button', { name: 'Delete Oats' }))
    const dialog = screen.getByRole('dialog', { name: /delete this food/i })
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^delete$/i }),
    )

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    const toast = toastAdd.mock.calls.at(-1)![0]
    // The backend's message reaches the user, not the misleading transient
    // "check your connection" copy, and with no pointless Retry action.
    expect(toast.description).toBe(rejection)
    expect(toast.actions).toBeUndefined()

    // The Food stays in the catalog and the confirm dialog is dismissed.
    expect(screen.getByRole('button', { name: 'Log Oats' })).toBeVisible()
    expect(
      screen.queryByRole('dialog', { name: /delete this food/i }),
    ).toBeNull()
  })
})

describe('/foods when the catalog fails to load', () => {
  it('shows a retryable error instead of the empty-catalog state', async () => {
    registerEndpoint('/api/foods', () => {
      throw createError({ statusCode: 500 })
    })

    await renderSuspended(Foods)

    expect(
      screen.getByRole('heading', { name: "Couldn't load your foods" }),
    ).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: /build your food catalog/i }),
    ).not.toBeInTheDocument()
  })
})

describe('/foods reached with the Add sheet asked for', () => {
  it('opens the Add sheet straight away', async () => {
    // Where the Log destination sends a User with an empty catalog (ADR 0028):
    // landing on the catalog and still having to find the button would spend
    // the tap the hand-off exists to save.
    await renderSuspended(Foods, { route: '/foods?add=1' })

    expect(screen.getByRole('dialog', { name: /add/i })).toBeVisible()
  })
})

describe('/foods once the Add sheet the query asked for is closed', () => {
  it('drops the query, so a reload does not reopen it', async () => {
    const user = userEvent.setup()
    await renderSuspended(Foods, { route: '/foods?add=1' })
    const sheet = screen.getByRole('dialog', { name: /add/i })

    await user.click(within(sheet).getByRole('button', { name: /close/i }))

    await vi.waitFor(() => expect(useRoute().query.add).toBeUndefined())
  })
})
