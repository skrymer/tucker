import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { failingRead, held } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { bodyAndPlan } from '~~/test/mocks/handlers/body'
import WeightHistorySection from './WeightHistorySection.vue'

const TODAY = '2026-10-12'

/** The calendar days carrying a dot, by their accessible names. */
function dottedDays() {
  return screen
    .getAllByRole('button', { name: /^\w+day, / })
    .filter((day) => day.querySelector('[data-slot="base"]'))
    .map((day) => day.getAttribute('aria-label'))
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

  it('tells its page a reading was saved, once the card holds it', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    const onSaved = vi.fn()
    await renderSuspended(WeightHistorySection, { props: { onSaved } })
    await screen.findByText('No weight on Mon 12 Oct.')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Add weight' }))
    const dialog = await screen.findByRole('dialog', { name: 'Log weight' })
    await user.type(within(dialog).getByLabelText(/Weight \(kg\)/), '81.4')
    await user.tab()
    await user.click(
      within(dialog).getByRole('button', { name: 'Save weight' }),
    )

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
  })
})
