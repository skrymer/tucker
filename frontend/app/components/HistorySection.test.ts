import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { failingRead, failingWrite, held } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { bodyAndPlan } from '~~/test/mocks/handlers/body'
import { dailyLogs } from '~~/test/mocks/handlers/entries'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import { markedDays } from '~~/test/calendar-marks'
import HistorySection from './HistorySection.vue'

const { toastAdd } = vi.hoisted(() => ({ toastAdd: vi.fn() }))
mockNuxtImport('useToast', () => () => ({
  add: toastAdd,
  remove: vi.fn(),
}))

const TODAY = '2026-10-12'

/** A Weighed Entry of [name], its figures stated by the caller. */
function weighed(
  id: number,
  name: string,
  grams: number,
  calories: number,
  protein: number,
) {
  return weighedEntry({
    id,
    foodId: id,
    foodName: name,
    grams,
    calories,
    protein,
  })
}

const ringedDays = () => markedDays('weigh-in')
const dottedDays = () => markedDays('entries')

/** A User whose one reading, 80.9 kg, is on Fri 9 Oct. */
const fridayReading = () =>
  bodyAndPlan({
    profile: null,
    today: TODAY,
    readings: [{ id: 1, measuredOn: '2026-10-09', weightKg: 80.9 }],
  })

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

/** Renders the card for a User with Calorie Tracking on unless told otherwise. */
function renderHistory(props: { tracksCalories?: boolean } = {}) {
  return renderSuspended(HistorySection, {
    props: { tracksCalories: true, ...props },
  })
}

describe('HistorySection', () => {
  beforeEach(() => {
    // Mon 12 Oct 2026, mid-morning local time; the clock keeps ticking.
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on today, selected and named as today', async () => {
    await renderHistory()

    expect(screen.queryByRole('region', { name: 'History' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Monday, October 12, 2026' }),
    ).toHaveAttribute('data-selected')
    expect(
      await screen.findByRole('heading', { name: 'Today · Mon 12 Oct' }),
    ).toBeVisible()
  })

  it('offers to add a weight on a picked day without one', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    await renderHistory()

    const panel = screen.getByRole('region', { name: 'Today · Mon 12 Oct' })
    expect(await within(panel).findByText('No weight.')).toBeVisible()
    expect(
      within(panel).queryByRole('button', { name: 'Add weight' }),
    ).toBeVisible()
  })

  it('offers neither No weight nor Add weight until the readings have been read', async () => {
    const read = held('get', '/api/weight')
    server.use(
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [{ id: 1, measuredOn: TODAY, weightKg: 80.9 }],
      }),
    )
    server.use(read.handler)
    await renderHistory()
    await read.arrived

    expect(screen.queryByText('No weight.')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Add weight' }),
    ).not.toBeInTheDocument()

    read.release()
    expect(await screen.findByText('80.9 kg')).toBeVisible()
  })

  it('rings the days that hold a reading, and no other', async () => {
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
    await renderHistory()

    await vi.waitFor(() =>
      expect(ringedDays()).toEqual([
        'Wednesday, October 7, 2026',
        'Friday, October 9, 2026',
      ]),
    )
  })

  it("opens Edit on the picked day's stored kg, with the date locked to it", async () => {
    server.use(...fridayReading())
    await renderHistory()
    await screen.findByText('No weight.')
    const user = userEvent.setup()
    expect(screen.queryByRole('button', { name: /^Edit/ })).toBeNull()
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
    await renderHistory()
    await screen.findByText('No weight.')

    await correctFriday(userEvent.setup(), '79.6')

    expect(await screen.findByText('79.6 kg')).toBeVisible()
    expect(screen.queryByText('80.9 kg')).not.toBeInTheDocument()
    expect(ringedDays()).toEqual([
      'Wednesday, October 7, 2026',
      'Friday, October 9, 2026',
    ])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('removes a confirmed reading, leaving the day empty and unringed', async () => {
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
    await renderHistory()
    await screen.findByText('No weight.')
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

    expect(await screen.findByText('No weight.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Add weight' })).toBeVisible()
    expect(screen.queryByText('80.9 kg')).not.toBeInTheDocument()
    expect(ringedDays()).toEqual(['Wednesday, October 7, 2026'])
    await vi.waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete this weight?' }),
      ).toBeNull(),
    )
  })

  it('backfills the picked day, ringing it and showing its reading', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    await renderHistory()
    await screen.findByText('No weight.')
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )

    await user.click(await screen.findByRole('button', { name: 'Add weight' }))
    const dialog = await screen.findByRole('dialog', { name: 'Log weight' })
    expect(within(dialog).queryByLabelText(/^Date/)).toBeNull()
    await user.type(within(dialog).getByLabelText(/Weight \(kg\)/), '81.4')
    await user.tab()
    await user.click(
      within(dialog).getByRole('button', { name: 'Save weight' }),
    )

    expect(await screen.findByText('81.4 kg')).toBeVisible()
    expect(ringedDays()).toEqual(['Thursday, October 8, 2026'])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('tells its page a reading was saved', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    const onChanged = vi.fn()
    await renderSuspended(HistorySection, {
      props: { tracksCalories: true, onChanged },
    })
    await screen.findByText('No weight.')
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

  it('asks before deleting, and cancelling keeps the reading and its ring', async () => {
    server.use(...fridayReading())
    await renderHistory()
    await screen.findByText('No weight.')
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
    expect(ringedDays()).toEqual(['Friday, October 9, 2026'])
  })

  it('removes a confirmed reading quietly, telling its page', async () => {
    toastAdd.mockClear()
    server.use(...fridayReading())
    const onChanged = vi.fn()
    await renderSuspended(HistorySection, {
      props: { tracksCalories: true, onChanged },
    })
    await screen.findByText('No weight.')
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

    expect(await screen.findByText('No weight.')).toBeVisible()
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(toastAdd).not.toHaveBeenCalled()
  })

  it('keeps the reading under a persistent error when a delete fails, and its Retry deletes it', async () => {
    toastAdd.mockClear()
    let down = true
    server.use(
      failingWrite('delete', '/api/weight/{id}', () => down),
      ...fridayReading(),
    )
    await renderHistory()
    await screen.findByText('No weight.')
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

    expect(await screen.findByText('No weight.')).toBeVisible()
    expect(ringedDays()).toEqual([])
  })

  it('removes a reading whose failed delete is retried after its confirm was cancelled, raising no second error', async () => {
    toastAdd.mockClear()
    let down = true
    server.use(
      failingWrite('delete', '/api/weight/{id}', () => down),
      ...fridayReading(),
    )
    await renderHistory()
    await screen.findByText('No weight.')
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
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const failures = toastAdd.mock.calls.length

    down = false
    await toastAdd.mock.calls.at(-1)![0].actions[0].onClick()

    expect(await screen.findByText('No weight.')).toBeVisible()
    expect(screen.queryByText('80.9 kg')).not.toBeInTheDocument()
    expect(toastAdd).toHaveBeenCalledTimes(failures)
  })

  it("leaves another reading's confirm open when an earlier failed delete's Retry lands", async () => {
    toastAdd.mockClear()
    let down = true
    server.use(
      failingWrite('delete', '/api/weight/{id}', () => down),
      ...bodyAndPlan({
        profile: null,
        today: TODAY,
        readings: [
          { id: 1, measuredOn: '2026-10-07', weightKg: 81.2 },
          { id: 2, measuredOn: '2026-10-09', weightKg: 80.9 },
        ],
      }),
    )
    await renderHistory()
    await screen.findByText('No weight.')
    const user = userEvent.setup()
    const askToDelete = async (day: string, button: string) => {
      await user.click(screen.getByRole('button', { name: day }))
      await user.click(await screen.findByRole('button', { name: button }))
      return screen.findByRole('dialog', { name: 'Delete this weight?' })
    }

    const friday = await askToDelete(
      'Friday, October 9, 2026',
      'Delete weight on Fri 9 Oct',
    )
    await user.click(within(friday).getByRole('button', { name: 'Delete' }))
    await vi.waitFor(() => expect(toastAdd).toHaveBeenCalled())
    await user.click(within(friday).getByRole('button', { name: 'Cancel' }))
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const wednesday = await askToDelete(
      'Wednesday, October 7, 2026',
      'Delete weight on Wed 7 Oct',
    )
    down = false
    await toastAdd.mock.calls.at(-1)![0].actions[0].onClick()

    expect(wednesday).toHaveTextContent('81.2 kg on Wed 7 Oct will be removed')
    expect(
      screen.getByRole('dialog', { name: 'Delete this weight?' }),
    ).toBeVisible()
  })

  it('keeps the old reading under a persistent error when a correction fails, and its Retry saves it', async () => {
    toastAdd.mockClear()
    let down = true
    server.use(
      failingWrite('post', '/api/weight', () => down),
      ...fridayReading(),
    )
    await renderHistory()
    await screen.findByText('No weight.')

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

  it('keeps the sheet up, reporting busy, until the save lands', async () => {
    // The sheet is the confirmation: dismissing it optimistically claims a
    // reading is stored before the server has said so (ADR 0007).
    const save = held('post', '/api/weight')
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    server.use(save.handler)
    await renderHistory()
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

  it('says the readings failed in the weight half, keeps the calendar, and retries them', async () => {
    let down = true
    server.use(
      failingRead('/api/weight', () => down),
      ...fridayReading(),
    )
    await renderHistory()
    const user = userEvent.setup()
    const panel = screen.getByRole('region', { name: 'Today · Mon 12 Oct' })

    expect(
      await within(panel).findByRole('heading', {
        name: "Couldn't load your weight history",
      }),
    ).toBeVisible()
    expect(within(panel).queryByText('No weight.')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Friday, October 9, 2026' }),
    ).toBeVisible()

    down = false
    await user.click(within(panel).getByRole('button', { name: 'Retry' }))

    await vi.waitFor(() =>
      expect(ringedDays()).toEqual(['Friday, October 9, 2026']),
    )
    expect(
      within(panel).queryByText("Couldn't load your weight history"),
    ).not.toBeInTheDocument()
  })

  it('offers no day after tomorrow, and runs back without a bound', async () => {
    await renderHistory()

    const day = (name: string) => screen.getByRole('button', { name })
    expect(day('Tuesday, October 13, 2026')).not.toHaveAttribute(
      'aria-disabled',
    )
    expect(day('Wednesday, October 14, 2026')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(day('Monday, September 28, 2026')).not.toHaveAttribute(
      'aria-disabled',
    )
  })

  it('offers no day after today with Calorie Tracking off', async () => {
    await renderHistory({ tracksCalories: false })

    const day = (name: string) => screen.getByRole('button', { name })
    expect(day('Monday, October 12, 2026')).not.toHaveAttribute('aria-disabled')
    expect(day('Tuesday, October 13, 2026')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('offers no weight to add on tomorrow, saying to weigh in on the day', async () => {
    server.use(...bodyAndPlan({ profile: null, readings: [], today: TODAY }))
    await renderHistory()
    await screen.findByText('No weight.')
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 13, 2026' }),
    )

    const panel = await screen.findByRole('region', {
      name: 'Tomorrow · Tue 13 Oct',
    })
    expect(within(panel).getByText('Weigh in on the day itself.')).toBeVisible()
    expect(
      within(panel).queryByRole('button', { name: 'Add weight' }),
    ).not.toBeInTheDocument()
    expect(within(panel).queryByText('No weight.')).not.toBeInTheDocument()
  })

  it('dots the days that hold Entries, and no other', async () => {
    server.use(
      ...dailyLogs({
        '2026-10-07': [weighed(1, 'Oats', 60, 233, 8)],
        '2026-10-08': [weighed(2, 'Banana', 120, 107, 1.3)],
      }),
    )
    await renderHistory()

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual([
        'Wednesday, October 7, 2026',
        'Thursday, October 8, 2026',
      ]),
    )
  })

  it('marks and keys only weigh-ins with Calorie Tracking off', async () => {
    server.use(
      ...fridayReading(),
      ...dailyLogs({ '2026-10-08': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderHistory({ tracksCalories: false })

    await vi.waitFor(() =>
      expect(ringedDays()).toEqual(['Friday, October 9, 2026']),
    )
    expect(dottedDays()).toEqual([])
    expect(screen.queryByTestId('calendar-legend')).toHaveTextContent(
      /^Weigh-in$/,
    )
  })

  it("shows a picked past day's three most recent Entries under a tally of all of them, and Show all ↔ Show less", async () => {
    // Four rows: one more than the capped list shows.
    server.use(
      ...dailyLogs({
        '2026-10-08': [
          weighed(1, 'Oats', 60, 233, 8),
          weighed(2, 'Banana', 120, 107, 1.3),
          weighed(3, 'Chicken breast', 200, 330, 62),
          weighed(4, 'Rice', 233, 111, 9),
        ],
      }),
    )
    await renderHistory()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )

    const panel = await screen.findByRole('region', { name: 'Thu 8 Oct' })
    const rows = () =>
      within(panel)
        .getAllByRole('listitem')
        .map((row) => row.textContent)
    const lastThree = [
      'Banana120 g · 107 kcal · 1 g protein',
      'Chicken breast200 g · 330 kcal · 62 g protein',
      'Rice233 g · 111 kcal · 9 g protein',
    ]
    expect(await within(panel).findByText('4 entries · 781 kcal')).toBeVisible()
    expect(rows()).toEqual(lastThree)

    await user.click(within(panel).getByRole('button', { name: 'Show all 4' }))
    expect(rows()).toEqual(['Oats60 g · 233 kcal · 8 g protein', ...lastThree])
    expect(within(panel).getByText('4 entries · 781 kcal')).toBeVisible()

    await user.click(within(panel).getByRole('button', { name: 'Show less' }))
    expect(rows()).toEqual(lastThree)
    expect(
      within(panel).getByRole('button', { name: 'Show all 4' }),
    ).toBeVisible()
  })

  it('says plainly that nothing was logged on a day with no Entries', async () => {
    await renderHistory()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 6, 2026' }),
    )

    const panel = await screen.findByRole('region', { name: 'Tue 6 Oct' })
    expect(
      await within(panel).findByText('Nothing logged.', { exact: true }),
    ).toBeVisible()
    expect(within(panel).queryByRole('list')).not.toBeInTheDocument()
    expect(within(panel).queryByText(/entries ·/)).not.toBeInTheDocument()
  })

  it("keeps the last day's Entries up, busy, while a newly picked day loads", async () => {
    server.use(...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }))
    await renderHistory()
    await screen.findByText('1 entry · 233 kcal')
    const user = userEvent.setup()
    const read = held('get', '/api/entries')
    server.use(read.handler)

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )
    await read.arrived

    const entries = screen.getByRole('region', { name: 'Entries' })
    expect(entries).toHaveAttribute('aria-busy', 'true')
    expect(within(entries).getByText('1 entry · 233 kcal')).toBeVisible()

    read.release()
    await vi.waitFor(() =>
      expect(entries).toHaveAttribute('aria-busy', 'false'),
    )
    expect(within(entries).getByText('Nothing logged.')).toBeVisible()
  })

  it("holds a loading skeleton where the first day's Entries will go, claiming nothing until they are answered", async () => {
    const read = held('get', '/api/entries')
    server.use(read.handler)

    const rendered = renderHistory()
    await read.arrived
    const entries = await screen.findByRole('region', { name: 'Entries' })
    expect(entries).toHaveAttribute('aria-busy', 'true')
    // Decorative: the region's aria-busy says it is loading, so the rows raise
    // no alert of their own.
    expect(within(entries).getByTestId('day-skeleton')).toBeInTheDocument()
    expect(within(entries).queryByRole('alert')).not.toBeInTheDocument()
    expect(
      within(entries).queryByText(/Nothing logged/),
    ).not.toBeInTheDocument()

    read.release()
    await rendered
    expect(await within(entries).findByText('Nothing logged.')).toBeVisible()
    expect(screen.queryByTestId('day-skeleton')).not.toBeInTheDocument()
  })

  it("says a picked day's Entries failed, keeps the calendar and the weight, and retries them", async () => {
    let failing = true
    server.use(
      failingRead('/api/entries', () => failing),
      ...fridayReading(),
      ...dailyLogs({ '2026-10-09': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderHistory()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )

    const panel = await screen.findByRole('region', { name: 'Fri 9 Oct' })
    expect(
      await within(panel).findByRole('heading', {
        name: "Couldn't load Fri 9 Oct",
        level: 3,
      }),
    ).toBeVisible()
    expect(within(panel).getByText('80.9 kg')).toBeVisible()
    expect(screen.queryByText(/Nothing logged/)).not.toBeInTheDocument()

    failing = false
    await user.click(within(panel).getByRole('button', { name: 'Retry' }))

    expect(await within(panel).findByText('1 entry · 233 kcal')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: "Couldn't load Fri 9 Oct" }),
    ).not.toBeInTheDocument()
  })

  it('says the logged days failed under the calendar, keeps the rings and the picked day, and retries them', async () => {
    let failing = true
    server.use(
      failingRead('/api/entries/days', () => failing),
      ...fridayReading(),
      ...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderHistory()
    const user = userEvent.setup()

    const error = await screen.findByRole('heading', {
      name: "Couldn't load logged days",
      level: 3,
    })
    expect(error).toBeVisible()
    const panel = screen.getByRole('region', { name: 'Today · Mon 12 Oct' })
    expect(await within(panel).findByText('1 entry · 233 kcal')).toBeVisible()
    expect(ringedDays()).toEqual(['Friday, October 9, 2026'])
    expect(dottedDays()).toEqual([])

    failing = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Monday, October 12, 2026']),
    )
    expect(
      screen.queryByRole('heading', { name: "Couldn't load logged days" }),
    ).not.toBeInTheDocument()
  })

  it('says the card failed to load once when both halves fail, and retries every read', async () => {
    let failing = true
    server.use(
      failingRead('/api/weight', () => failing),
      failingRead('/api/entries', () => failing),
      ...fridayReading(),
      ...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderHistory()
    const user = userEvent.setup()

    expect(
      await screen.findByRole('heading', {
        name: "Couldn't load this card",
        level: 3,
      }),
    ).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
    expect(
      screen.queryByRole('heading', {
        name: "Couldn't load your weight history",
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: "Couldn't load Mon 12 Oct" }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Previous month' }),
    ).not.toBeInTheDocument()

    failing = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    const panel = await screen.findByRole('region', {
      name: 'Today · Mon 12 Oct',
    })
    expect(await within(panel).findByText('1 entry · 233 kcal')).toBeVisible()
    await vi.waitFor(() =>
      expect(ringedDays()).toEqual(['Friday, October 9, 2026']),
    )
    expect(
      screen.queryByRole('heading', { name: "Couldn't load this card" }),
    ).not.toBeInTheDocument()
  })

  it('draws the calendar for a User who has never logged an Entry', async () => {
    server.use(...dailyLogs({}, { since: null }))
    await renderHistory()

    const panel = screen.getByRole('region', { name: 'Today · Mon 12 Oct' })
    expect(await within(panel).findByText('Nothing logged.')).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Monday, October 12, 2026' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Previous month' }),
    ).not.toBeDisabled()
    expect(screen.queryByText('Nothing logged yet')).not.toBeInTheDocument()
  })

  it('keeps the marks of a month already read, paging back to it', async () => {
    // Each month's logged day lies outside the other's grid, so only a read
    // of September's own grid can dot 10 Sep.
    server.use(
      ...dailyLogs({
        '2026-09-10': [weighed(1, 'Oats', 60, 233, 8)],
        '2026-10-12': [weighed(2, 'Banana', 120, 107, 1.3)],
      }),
    )
    await renderHistory()
    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Monday, October 12, 2026']),
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Thursday, September 10, 2026']),
    )

    // Only October's first answer can dot it now.
    server.use(failingRead('/api/entries/days'))
    await user.click(screen.getByRole('button', { name: 'Next month' }))

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Monday, October 12, 2026']),
    )
  })

  it('keeps the month paged to when both halves recover', async () => {
    let entriesDown = false
    let weightDown = true
    server.use(
      failingRead('/api/weight', () => weightDown),
      failingRead('/api/entries', () => entriesDown),
      ...dailyLogs(),
    )
    await renderHistory()
    await screen.findByRole('heading', {
      name: "Couldn't load your weight history",
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    entriesDown = true
    await user.click(
      screen.getByRole('button', { name: 'Thursday, September 10, 2026' }),
    )
    await screen.findByRole('heading', { name: "Couldn't load this card" })

    entriesDown = false
    weightDown = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('September 2026')).toBeVisible()
    expect(
      await screen.findByRole('region', { name: 'Thu 10 Sept' }),
    ).toBeVisible()
  })

  it('starts a newly picked day collapsed, after Show all on the last one', async () => {
    server.use(
      ...dailyLogs({
        '2026-10-08': [1, 2, 3, 4].map((id) =>
          weighed(id, `Thu ${id}`, 100, 100, 1),
        ),
        '2026-10-06': [1, 2, 3, 4, 5].map((id) =>
          weighed(10 + id, `Tue ${id}`, 100, 100, 1),
        ),
      }),
    )
    await renderHistory()
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Show all 4' }))

    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 6, 2026' }),
    )

    const entries = screen.getByRole('region', { name: 'Entries' })
    expect(await within(entries).findByText('Tue 5')).toBeVisible()
    expect(within(entries).getAllByRole('listitem')).toHaveLength(3)
    expect(within(entries).getByText('Tue 3')).toBeVisible()
    expect(within(entries).queryByText('Tue 2')).not.toBeInTheDocument()
    expect(
      within(entries).getByRole('button', { name: 'Show all 5' }),
    ).toBeVisible()
    expect(
      within(entries).queryByRole('button', { name: 'Show less' }),
    ).not.toBeInTheDocument()
  })

  it('leaves the shown day expanded until a newly picked one arrives', async () => {
    server.use(
      ...dailyLogs({
        '2026-10-08': [1, 2, 3, 4].map((id) =>
          weighed(id, `Thu ${id}`, 100, 100, 1),
        ),
      }),
    )
    await renderHistory()
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )
    await user.click(await screen.findByRole('button', { name: 'Show all 4' }))
    const read = held('get', '/api/entries')
    server.use(read.handler)

    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 6, 2026' }),
    )
    await read.arrived

    const entries = screen.getByRole('region', { name: 'Entries' })
    expect(within(entries).getAllByRole('listitem')).toHaveLength(4)
    expect(
      within(entries).getByRole('button', { name: 'Show less' }),
    ).toBeVisible()
    read.release()
  })

  it('flags an estimated Entry and states no grams for it', async () => {
    server.use(
      ...dailyLogs({
        '2026-10-08': [
          weighed(1, 'Oats', 60, 233, 8),
          estimatedEntry({
            id: 2,
            label: 'Pub burger',
            calories: 650,
            protein: 35,
          }),
        ],
      }),
    )
    await renderHistory()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )

    const entries = screen.getByRole('region', { name: 'Entries' })
    await within(entries).findByText('Pub burger')
    const [oats, burger] = within(entries).getAllByRole('listitem')
    expect(burger).toHaveTextContent(
      /^Pub burger est\. 650 kcal · 35 g protein$/,
    )
    expect(oats).not.toHaveTextContent('est.')
  })

  it('names tomorrow as tomorrow and shows an Entry logged ahead for it', async () => {
    server.use(...dailyLogs({ '2026-10-13': [weighed(1, 'Oats', 60, 233, 8)] }))
    await renderHistory()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 13, 2026' }),
    )

    const panel = await screen.findByRole('region', {
      name: 'Tomorrow · Tue 13 Oct',
    })
    expect(await within(panel).findByText('1 entry · 233 kcal')).toBeVisible()
    expect(within(panel).getByRole('listitem')).toHaveTextContent(
      'Oats60 g · 233 kcal · 8 g protein',
    )
  })

  it('moves today, tomorrow and the last pickable day on when the day turns over', async () => {
    await renderHistory()
    const day = (name: string) => screen.getByRole('button', { name })
    expect(day('Wednesday, October 14, 2026')).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    // The page comes back on Tuesday morning.
    vi.setSystemTime(new Date(2026, 9, 13, 8, 0))
    document.dispatchEvent(new Event('visibilitychange'))

    expect(
      await screen.findByRole('heading', { name: 'Mon 12 Oct' }),
    ).toBeVisible()
    expect(day('Wednesday, October 14, 2026')).not.toHaveAttribute(
      'aria-disabled',
    )
    expect(day('Thursday, October 15, 2026')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('states no tally while the first day is loading', async () => {
    const read = held('get', '/api/entries')
    server.use(read.handler)

    const rendered = renderHistory()
    await read.arrived
    const entries = await screen.findByRole('region', { name: 'Entries' })

    expect(entries).toHaveAttribute('aria-busy', 'true')
    expect(within(entries).queryByText(/entr(y|ies) ·/)).toBeNull()
    read.release()
    await rendered
  })

  it('states no tally beside a day whose Entries failed to load', async () => {
    server.use(failingRead('/api/entries'))
    await renderHistory()

    const entries = screen.getByRole('region', { name: 'Entries' })
    expect(
      await within(entries).findByRole('heading', {
        name: "Couldn't load Mon 12 Oct",
      }),
    ).toBeVisible()
    expect(within(entries).queryByText(/entr(y|ies) ·/)).toBeNull()
  })

  it('says the readings failed for a User without Calorie Tracking, raising no error', async () => {
    const errors: unknown[] = []
    useNuxtApp().hook('vue:error', (error) => {
      errors.push(error)
    })
    server.use(failingRead('/api/weight'), ...fridayReading())
    await renderHistory({ tracksCalories: false })

    expect(
      await screen.findByRole('heading', {
        name: "Couldn't load your weight history",
      }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(errors).toEqual([])
  })

  it('clears the readings and the logged days with the one Retry when both fail', async () => {
    let failing = true
    server.use(
      failingRead('/api/weight', () => failing),
      failingRead('/api/entries/days', () => failing),
      ...fridayReading(),
      ...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderHistory()
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: "Couldn't load this card" })

    failing = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Monday, October 12, 2026']),
    )
    expect(ringedDays()).toEqual(['Friday, October 9, 2026'])
    expect(
      screen.queryByRole('heading', { name: "Couldn't load logged days" }),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('offers no delete and states no Budget or verdict for Entries, today included', async () => {
    server.use(...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }))
    await renderHistory()

    const entries = screen.getByRole('region', { name: 'Entries' })
    expect(await within(entries).findByRole('listitem')).toHaveTextContent(
      'Oats',
    )
    expect(within(entries).queryByRole('button')).not.toBeInTheDocument()
    expect(within(entries).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(entries).queryByText(/budget|left|over|under/i)).toBeNull()
  })

  it('has no Entries half with Calorie Tracking off', async () => {
    server.use(
      ...fridayReading(),
      ...dailyLogs({ '2026-10-09': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderHistory({ tracksCalories: false })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Friday, October 9, 2026' }),
    )

    const panel = screen.getByRole('region', { name: 'Fri 9 Oct' })
    expect(await within(panel).findByText('80.9 kg')).toBeVisible()
    expect(
      within(panel).queryByRole('region', { name: 'Entries' }),
    ).not.toBeInTheDocument()
    expect(within(panel).queryByText(/Oats|entry|Nothing logged/)).toBeNull()
  })

  it('leaves the Entries as they stand when a reading is saved', async () => {
    server.use(
      ...bodyAndPlan({ profile: null, readings: [], today: TODAY }),
      ...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderHistory()
    const entries = screen.getByRole('region', { name: 'Entries' })
    await within(entries).findByText('1 entry · 233 kcal')
    // Any re-read of the Entries now hangs, holding the half busy.
    server.use(held('get', '/api/entries').handler)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Add weight' }))
    const dialog = await screen.findByRole('dialog', { name: 'Log weight' })
    await user.type(within(dialog).getByLabelText(/Weight \(kg\)/), '81.4')
    await user.tab()
    await user.click(
      within(dialog).getByRole('button', { name: 'Save weight' }),
    )

    expect(await screen.findByText('81.4 kg')).toBeVisible()
    expect(entries).toHaveAttribute('aria-busy', 'false')
    expect(within(entries).getByText('1 entry · 233 kcal')).toBeVisible()
  })
})
