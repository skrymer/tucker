import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { besideCatalog, catalog, catalogOnceReread } from '~~/test/catalog-host'
import { food } from '~~/test/food-fixtures'
import { foodCatalog } from '~~/test/mocks/handlers/catalog'
import { failingWrite, held } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import DeleteFoodConfirm from './DeleteFoodConfirm.vue'

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

describe('DeleteFoodConfirm', () => {
  beforeEach(() => toastAdd.mockClear())

  it('asks the user to confirm deleting the named food', async () => {
    await renderSuspended(DeleteFoodConfirm, { props: { food: oats } })

    expect(
      screen.getByRole('dialog', { name: /delete this food/i }),
    ).toBeVisible()
    expect(screen.getByText(/Oats/)).toBeVisible()
    expect(screen.getByRole('button', { name: /delete/i })).toBeVisible()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeVisible()
  })

  it('names the food in sentence case however it was typed', async () => {
    await renderSuspended(DeleteFoodConfirm, {
      props: { food: food({ id: 8, name: 'LIGHT MILK' }) },
    })

    expect(screen.getByText('Light milk')).toBeVisible()
  })

  it('warns that a food with logged entries cannot be deleted', async () => {
    await renderSuspended(DeleteFoodConfirm, { props: { food: oats } })

    expect(screen.getByText(/logged entries.*can't be deleted/i)).toBeVisible()
    // The old copy promised deletion always works ("entries keep their
    // numbers") — it contradicts the rule and must be gone.
    expect(screen.queryByText(/keep their numbers/i)).toBeNull()
  })

  it('warns that a food used as a recipe ingredient cannot be deleted', async () => {
    await renderSuspended(DeleteFoodConfirm, { props: { food: oats } })

    expect(
      screen.getByText(/recipe ingredient.*can't be deleted/i),
    ).toBeVisible()
  })

  it('deletes the food on Delete, then closes itself', async () => {
    const bread = food({ id: 8, name: 'Bread' })
    server.use(...foodCatalog({ foods: [oats, bread] }))
    const onClose = vi.fn()
    await renderSuspended(besideCatalog(DeleteFoodConfirm), {
      props: { food: oats, onClose },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^delete$/i }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    const shown = await catalogOnceReread()
    expect(shown.getByText('Bread')).toBeVisible()
    expect(shown.queryByText('Oats')).not.toBeInTheDocument()
  })

  it('names a failed delete in its own persistent error toast', async () => {
    server.use(
      failingWrite('delete', '/api/foods/{id}'),
      ...foodCatalog({ foods: [oats] }),
    )
    await renderSuspended(besideCatalog(DeleteFoodConfirm), {
      props: { food: oats },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^delete$/i }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not delete food',
          duration: Infinity,
          actions: [expect.objectContaining({ label: 'Retry' })],
        }),
      ),
    )
  })

  it('reports Delete busy until the delete lands', async () => {
    const remove = held('delete', '/api/foods/{id}')
    server.use(...foodCatalog({ foods: [oats] }))
    server.use(remove.handler)
    await renderSuspended(besideCatalog(DeleteFoodConfirm), {
      props: { food: oats },
    })
    const confirm = () => screen.getByRole('button', { name: /^delete$/i })

    await userEvent.setup().click(confirm())

    await remove.arrived
    await vi.waitFor(() => expect(confirm()).toBeDisabled())
    remove.release()
  })

  it('states why a food with logged entries was not deleted, and closes', async () => {
    server.use(...foodCatalog({ foods: [oats], logged: [oats.id] }))
    const onClose = vi.fn()
    await renderSuspended(besideCatalog(DeleteFoodConfirm), {
      props: { food: oats, onClose },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /^delete$/i }))

    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    // Persistent and dismissible with no Retry: the refusal is permanent, so
    // trying again could never succeed (ADR 0005).
    expect(toastAdd).toHaveBeenCalledExactlyOnceWith({
      title: 'Could not delete food',
      description: "Oats has logged Entries and can't be deleted.",
      color: 'error',
      type: 'foreground',
      duration: Infinity,
      close: true,
      progress: false,
    })
    expect(catalog().getByText('Oats')).toBeVisible()
  })

  it('cancels the deletion when the user clicks Cancel', async () => {
    const onClose = vi.fn()
    await renderSuspended(DeleteFoodConfirm, {
      props: { food: oats, onClose },
    })

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /cancel/i }))

    expect(onClose).toHaveBeenCalledOnce()
  })
})
