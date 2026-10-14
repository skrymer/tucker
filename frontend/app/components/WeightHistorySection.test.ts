import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { failingRead, failingWrite, held } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { bodyAndPlan } from '~~/test/mocks/handlers/body'
import WeightHistorySection from './WeightHistorySection.vue'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

const TODAY = '2026-10-12'

/** The calendar days carrying a dot, by their accessible names. */
function dottedDays() {
  return screen
    .getAllByRole('button', { name: /^\w+day, / })
    .filter((day) => day.querySelector('[data-slot="base"]'))
    .map((day) => day.getAttribute('aria-label'))
}

/** Picks Fri 9 Oct, opens its Edit, and saves `kg` in its place. */
async function correctFriday(
  user: ReturnType<typeof userEvent.setup>,
  kg: string,
) {
  await user.click(
    screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
  )
  await user.click(
    await screen.findByRole('button', { name: 'Edit weight on Fri 9 Oct' }),
  )
  const dialog = await screen.findByRole('dialog', { name: 'Log weight' })
  const weight = within(dialog).getByLabelText(/Weight \(kg\)/)
  await user.clear(weight)
  await user.type(weight, kg)
  // A number field commits its model on blur, so leave it before submitting.
  await user.tab()
  await user.click(within(dialog).getByRole('button', { name: 'Save weight' }))
}

describe('WeightHistorySection', () => {
  beforeEach(() => {
    // Mon 12 Oct 2026, mid-morning local time; the clock keeps ticking.
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on today, offering to add a weight when none is logged', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    await renderSuspended(WeightHistorySection)

    expect(screen.getByRole('region', { name: 'Weight history' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Monday, October 12, 2026' }),
    ).toHaveAttribute('data-selected')
    expect(await screen.findByText('No weight on Mon 12 Oct.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add weight' })).toBeVisible()
  })

  it('refuses the day after today, and offers today', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')

    expect(
      screen.getByRole('button', { name: 'Tuesday, October 13, 2026' }),
    ).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByRole('button', { name: 'Monday, October 12, 2026' }),
    ).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('opens the next day for picking once the clock turns over', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')
    const nextDay = () =>
      screen.getByRole('button', { name: 'Tuesday, October 13, 2026' })
    expect(nextDay()).toHaveAttribute('aria-disabled', 'true')

    vi.setSystemTime(new Date(2026, 9, 13, 9, 0))
    document.dispatchEvent(new Event('visibilitychange'))

    await vi.waitFor(() =>
      expect(nextDay()).not.toHaveAttribute('aria-disabled', 'true'),
    )
  })

  it('offers neither the empty state nor Add weight until the readings have been read', async () => {
    const read = held('get', '/api/weight')
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: TODAY, weightKg: 80.9 }],
      }),
    )
    server.use(read.handler)
    await renderSuspended(WeightHistorySection)
    await read.arrived

    expect(screen.queryByText(/No weight on/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add weight' }),
    ).not.toBeInTheDocument()

    read.release()
    expect(await screen.findByText('80.9 kg')).toBeVisible()
  })

  it('dots the days that hold a reading, and no other', async () => {
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [
          { id: 1, measuredOn: '2026-10-07', weightKg: 81.2 },
          { id: 2, measuredOn: '2026-10-09', weightKg: 80.9 },
        ],
      }),
    )
    await renderSuspended(WeightHistorySection)

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual([
        'Wednesday, October 7, 2026',
        'Friday, October 9, 2026',
      ]),
    )
  })

  it('shows the raw reading of a picked day that has one', async () => {
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )

    expect(await screen.findByText('80.9 kg')).toBeVisible()
    expect(screen.queryByText(/No weight on/)).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add weight' }),
    ).not.toBeInTheDocument()
  })

  it('offers Edit on a picked day holding a reading, and not on one without', async () => {
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()

    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Edit weight on Fri 9 Oct' }),
    ).toBeVisible()
  })

  it('offers Delete on a picked day holding a reading, and not on one without', async () => {
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()

    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull()

    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )

    expect(
      await screen.findByRole('button', { name: 'Delete weight on Fri 9 Oct' }),
    ).toBeVisible()
  })

  it('asks before deleting, and cancelling keeps the reading and its dot', async () => {
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )

    await user.click(
      await screen.findByRole('button', { name: 'Delete weight on Fri 9 Oct' }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'Delete this weight?',
    })
    expect(dialog).toHaveTextContent(
      '80.9 kg on Fri 9 Oct will be removed, and your trend weight re-derives without it.',
    )

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await vi.waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete this weight?' }),
      ).toBeNull(),
    )
    expect(screen.getByText('80.9 kg')).toBeVisible()
    expect(dottedDays()).toEqual(['Friday, October 9, 2026'])
  })

  it('removes a confirmed reading quietly, leaving the day empty and telling its page', async () => {
    toastAdd.mockClear()
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [
          { id: 1, measuredOn: '2026-10-07', weightKg: 81.2 },
          { id: 2, measuredOn: '2026-10-09', weightKg: 80.9 },
        ],
      }),
    )
    const onChanged = vi.fn()
    await renderSuspended(WeightHistorySection, { props: { onChanged } })
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Delete weight on Fri 9 Oct' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete this weight?',
    })

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(await screen.findByText('No weight on Fri 9 Oct.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add weight' })).toBeVisible()
    expect(screen.queryByText('80.9 kg')).not.toBeInTheDocument()
    expect(dottedDays()).toEqual(['Wednesday, October 7, 2026'])
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete this weight?' }),
      ).toBeNull(),
    )
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('keeps the reading under a persistent error when a delete fails, and its Retry deletes it', async () => {
    toastAdd.mockClear()
    let down = true
    server.use(
      failingWrite('delete', '/api/weight/{id}', () => down),
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )
    await user.click(
      await screen.findByRole('button', { name: 'Delete weight on Fri 9 Oct' }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete this weight?',
    })

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not delete weight',
          duration: Infinity,
          actions: [expect.objectContaining({ label: 'Retry' })],
        }),
      ),
    )
    expect(
      screen.getByRole('dialog', { name: 'Delete this weight?' }),
    ).toBeVisible()
    expect(screen.getByText('80.9 kg')).toBeInTheDocument()

    down = false
    toastAdd.mock.calls.at(-1)![0].actions[0].onClick()

    expect(await screen.findByText('No weight on Fri 9 Oct.')).toBeVisible()
    expect(dottedDays()).toEqual([])
  })

  it("opens Edit on the picked day's stored kg, with the date locked to it", async () => {
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )

    await user.click(
      await screen.findByRole('button', { name: 'Edit weight on Fri 9 Oct' }),
    )

    const dialog = await screen.findByRole('dialog', { name: 'Log weight' })
    expect(within(dialog).getByLabelText(/Weight \(kg\)/)).toHaveValue('80.9')
    expect(within(dialog).queryByLabelText(/^Date/)).toBeNull()
  })

  it("replaces the picked day's reading with the corrected one", async () => {
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [
          { id: 1, measuredOn: '2026-10-07', weightKg: 81.2 },
          { id: 2, measuredOn: '2026-10-09', weightKg: 80.9 },
        ],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')

    await correctFriday(userEvent.setup(), '79.6')

    expect(await screen.findByText('79.6 kg')).toBeVisible()
    expect(screen.queryByText('80.9 kg')).not.toBeInTheDocument()
    expect(dottedDays()).toEqual([
      'Wednesday, October 7, 2026',
      'Friday, October 9, 2026',
    ])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps the old reading under a persistent error when a correction fails, and its Retry saves it', async () => {
    toastAdd.mockClear()
    let down = true
    server.use(
      failingWrite('post', '/api/weight', () => down),
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')

    await correctFriday(userEvent.setup(), '79.6')

    await vi.waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Could not save weight',
          duration: Infinity,
        }),
      ),
    )
    expect(screen.getByRole('dialog', { name: 'Log weight' })).toBeVisible()
    expect(screen.getByText('80.9 kg')).toBeInTheDocument()
    expect(screen.queryByText('79.6 kg')).not.toBeInTheDocument()

    down = false
    toastAdd.mock.calls.at(-1)![0].actions[0].onClick()

    expect(await screen.findByText('79.6 kg')).toBeVisible()
    expect(screen.queryByText('80.9 kg')).not.toBeInTheDocument()
  })

  it("does not show another day's reading on a day that has none", async () => {
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Friday, October 9, 2026']),
    )

    expect(screen.getByText('No weight on Mon 12 Oct.')).toBeVisible()
    expect(screen.queryByText('80.9 kg')).not.toBeInTheDocument()
  })

  it('offers a retry inside the card when the readings cannot be read', async () => {
    let down = true
    server.use(
      failingRead('/api/weight', () => down),
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
      }),
    )
    await renderSuspended(WeightHistorySection)
    const user = userEvent.setup()
    const card = screen.getByRole('region', { name: 'Weight history' })

    expect(
      await within(card).findByText("Couldn't load your weight history"),
    ).toBeVisible()
    expect(within(card).queryByText(/No weight on/)).not.toBeVisible()

    down = false
    await user.click(within(card).getByRole('button', { name: 'Retry' }))

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Friday, October 9, 2026']),
    )
    expect(
      within(card).queryByText("Couldn't load your weight history"),
    ).not.toBeInTheDocument()
  })

  it('keeps the sheet up, reporting busy, until the save lands', async () => {
    // The sheet is the confirmation: dismissing it optimistically claims a
    // reading is stored before the server has said so (ADR 0007).
    const save = held('post', '/api/weight')
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    server.use(save.handler)
    await renderSuspended(WeightHistorySection)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add weight' }))
    const dialog = await screen.findByRole('dialog', { name: 'Log weight' })
    await user.type(within(dialog).getByLabelText(/Weight \(kg\)/), '84.2')
    // A number field commits its model on blur, so leave it before submitting.
    await user.tab()
    const saveWeight = () =>
      within(dialog).getByRole('button', { name: 'Save weight' })
    await user.click(saveWeight())

    await save.arrived
    await vi.waitFor(() => expect(saveWeight()).toBeDisabled())

    save.release()
    await vi.waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Log weight' })).toBeNull(),
    )
  })

  it('backfills the picked day, dotting it and showing its reading', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    await renderSuspended(WeightHistorySection)
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )

    await user.click(await screen.findByRole('button', { name: 'Add weight' }))
    const dialog = await screen.findByRole('dialog', { name: 'Log weight' })
    await user.type(within(dialog).getByLabelText(/Weight \(kg\)/), '81.4')
    await user.tab()
    await user.click(
      within(dialog).getByRole('button', { name: 'Save weight' }),
    )

    expect(await screen.findByText('81.4 kg')).toBeVisible()
    expect(dottedDays()).toEqual(['Thursday, October 8, 2026'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('tells its page a reading was saved', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    const onChanged = vi.fn()
    await renderSuspended(WeightHistorySection, { props: { onChanged } })
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Add weight' }))
    const dialog = await screen.findByRole('dialog', { name: 'Log weight' })
    await user.type(within(dialog).getByLabelText(/Weight \(kg\)/), '81.4')
    await user.tab()
    await user.click(
      within(dialog).getByRole('button', { name: 'Save weight' }),
    )

    await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1))
  })
})
