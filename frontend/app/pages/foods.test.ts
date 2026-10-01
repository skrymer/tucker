import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { food } from '~~/test/food-fixtures'
import { foodCatalog } from '~~/test/mocks/handlers/catalog'
import { catalogFails } from '~~/test/mocks/handlers/foods'
import { http } from '~~/test/mocks/http'
import { server, useMswServer } from '~~/test/mocks/node'
import Foods from './foods.vue'

useMswServer()

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

// A test stating its own catalog `use()`s it after this, which wins.
beforeEach(() => {
  toastAdd.mockClear()
  server.use(...foodCatalog({ foods: [oats] }))
})

/** Fills the open Add sheet with a Food named "Skyr" and saves it. */
async function saveSkyr(
  user: ReturnType<typeof userEvent.setup>,
  sheet: HTMLElement,
) {
  await user.type(within(sheet).getByLabelText(/^name$/i), 'Skyr')
  for (const macro of [
    /protein \/100\s*g/i,
    /carbs \/100\s*g/i,
    /fat \/100\s*g/i,
  ]) {
    await user.click(within(sheet).getByLabelText(macro))
    await user.keyboard('5')
  }
  // A number field commits its model on blur, so leave the last one.
  await user.tab()
  await user.click(within(sheet).getByRole('button', { name: /save food/i }))
}

describe('/foods deleting a food with logged entries', () => {
  it('surfaces the rule message as a persistent error with no Retry, and keeps the food listed', async () => {
    // The backend refuses deleting a Food that has logged Entries with a 400
    // whose `{ message }` names the Food.
    server.use(...foodCatalog({ foods: [oats], logged: [oats.id] }))
    await renderSuspended(Foods)

    await userEvent.click(screen.getByRole('button', { name: 'Delete Oats' }))
    const dialog = screen.getByRole('dialog', { name: /delete this food/i })
    await userEvent.click(
      within(dialog).getByRole('button', { name: /^delete$/i }),
    )

    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    // The backend's message reaches the user, not the misleading transient
    // "check your connection" copy. Hand-rolled rather than routed through
    // useApiMutation's shared toast, so nothing else pins its shape: assertive,
    // dismissible, and persistent with no countdown, because the rejection is
    // permanent (ADR 0005). Closed-world, so the absent Retry is asserted by the
    // shape rather than by a separate check for it — as is the absent `id` the
    // shared error path carries: one toast can't stack on itself under
    // `toaster.max: 1`, and the confirm closing behind it is the other exit.
    expect(toastAdd.mock.calls.at(-1)![0]).toEqual({
      title: 'Could not delete food',
      description: "Oats has logged Entries and can't be deleted.",
      color: 'error',
      type: 'foreground',
      duration: Infinity,
      close: true,
      progress: false,
    })

    // The Food stays in the catalog and the confirm dialog is dismissed.
    expect(screen.getByText('Oats')).toBeVisible()
    expect(
      screen.queryByRole('dialog', { name: /delete this food/i }),
    ).toBeNull()
  })
})

describe('/foods saving a new food', () => {
  it('closes the Add sheet onto the catalog, which is the confirmation', async () => {
    const user = userEvent.setup()
    await renderSuspended(Foods, { route: '/foods?add=1' })

    await saveSkyr(user, screen.getByRole('dialog', { name: /add/i }))

    // There is no "log it now" continuation to hold the sheet open any more
    // (ADR 0028), and no success toast either: the row in the list behind it is
    // the confirmation (ADR 0005).
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /add/i })).toBeNull(),
    )
    expect(await screen.findByText('Skyr')).toBeVisible()
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('leaves a sheet the User has reopened alone when a slow save lands', async () => {
    // The save resolves whenever it resolves, which on a slow connection is
    // after the User has given up on it, dismissed the sheet and opened a fresh
    // one. Closing *that* sheet would take a half-typed Recipe with it.
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('/api/foods', async () => {
        await held
        return undefined
      }),
    )
    const user = userEvent.setup()
    await renderSuspended(Foods, { route: '/foods?add=1' })

    const sheet = screen.getByRole('dialog', { name: /add/i })
    await saveSkyr(user, sheet)

    // Dismissed while the save is still in flight, then reopened.
    await user.click(within(sheet).getByRole('button', { name: /close/i }))
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /add/i })).toBeNull(),
    )
    await user.click(screen.getByRole('button', { name: /add food/i }))
    expect(screen.getByRole('dialog', { name: /add/i })).toBeVisible()

    release()

    // The reopened sheet survives the save that the previous one issued, whose
    // Food the catalog behind it now lists.
    expect(await screen.findByText('Skyr')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: /add/i })).toBeVisible()
  })
})

describe('/foods saving a Food’s Tags', () => {
  it('names a save that failed for want of a connection in its own error toast', async () => {
    server.use(
      http.put('/api/foods/{id}/tags', ({ response }) =>
        response(503).json({ message: 'no connection to the server' }),
      ),
      ...foodCatalog({
        foods: [oats],
        tags: [{ id: 1, name: 'snack', foodCount: 0 }],
      }),
    )
    const user = userEvent.setup()
    await renderSuspended(Foods)

    await user.click(screen.getByRole('button', { name: 'Tags for Oats' }))
    const sheet = screen.getByRole('dialog', { name: 'Tags for Oats' })
    await user.click(within(sheet).getByRole('button', { name: 'Save tags' }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Could not save tags' }),
      ),
    )
  })
})

describe('/foods managing Tags', () => {
  it('re-reads the catalog once a Tag is deleted, so no row still wears it', async () => {
    server.use(
      ...foodCatalog({
        foods: [{ ...oats, tags: [{ id: 9, name: 'snack' }] }],
      }),
    )
    const user = userEvent.setup()
    await renderSuspended(Foods)
    expect(screen.getByText('snack')).toBeVisible()

    await user.click(screen.getByRole('button', { name: 'Manage tags' }))
    const sheet = screen.getByRole('dialog', { name: 'Manage tags' })
    await user.click(
      await within(sheet).findByRole('button', { name: 'Delete snack' }),
    )
    await user.click(within(sheet).getByRole('button', { name: 'Delete tag' }))

    await vi.waitFor(() =>
      expect(screen.queryByText('snack')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Oats')).toBeInTheDocument()
  })
})

describe('/foods when the catalog fails to load', () => {
  it('shows a retryable error instead of the empty-catalog state', async () => {
    server.use(catalogFails())

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
