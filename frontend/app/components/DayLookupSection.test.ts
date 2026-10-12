import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { failingRead, held } from '~~/test/mocks/http'
import { server } from '~~/test/mocks/node'
import { dailyLogs } from '~~/test/mocks/handlers/entries'
import { estimatedEntry, weighedEntry } from '~~/test/entry-fixtures'
import DayLookupSection from './DayLookupSection.vue'

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

describe('DayLookupSection', () => {
  beforeEach(() => {
    // Mon 12 Oct 2026, mid-morning local time; the clock keeps ticking.
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 9, 12, 10, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on today, selected and named as today', async () => {
    await renderSuspended(DayLookupSection)
    await screen.findByText('Nothing logged on Mon 12 Oct.')

    expect(screen.getByRole('region', { name: 'Look up a day' })).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Monday, October 12, 2026' }),
    ).toHaveAttribute('data-selected')
    expect(
      screen.getByRole('heading', { name: 'Today · Mon 12 Oct' }),
    ).toBeVisible()
  })

  it('lists every Entry of a picked past day, grams first, under its tally', async () => {
    // Four rows: one more than Today's capped list shows.
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
    await renderSuspended(DayLookupSection)
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )

    const panel = await screen.findByRole('region', { name: 'Thu 8 Oct' })
    expect(within(panel).getByText('4 entries · 781 kcal')).toBeVisible()
    const rows = within(panel).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      'Oats60 g · 233 kcal · 8 g protein',
      'Banana120 g · 107 kcal · 1 g protein',
      'Chicken breast200 g · 330 kcal · 62 g protein',
      'Rice233 g · 111 kcal · 9 g protein',
    ])
    expect(
      within(panel).queryByRole('button', { name: /show all/i }),
    ).not.toBeInTheDocument()
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
    await renderSuspended(DayLookupSection)
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )

    const panel = await screen.findByRole('region', { name: 'Thu 8 Oct' })
    const [oats, burger] = within(panel).getAllByRole('listitem')
    expect(burger).toHaveTextContent(
      /^Pub burger est\. 650 kcal · 35 g protein$/,
    )
    expect(oats).not.toHaveTextContent('est.')
  })

  it('names tomorrow as tomorrow and shows an Entry logged ahead for it', async () => {
    server.use(...dailyLogs({ '2026-10-13': [weighed(1, 'Oats', 60, 233, 8)] }))
    await renderSuspended(DayLookupSection)
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 13, 2026' }),
    )

    const panel = await screen.findByRole('region', {
      name: 'Tomorrow · Tue 13 Oct',
    })
    expect(within(panel).getByText('1 entry · 233 kcal')).toBeVisible()
    expect(within(panel).getByRole('listitem')).toHaveTextContent(
      'Oats60 g · 233 kcal · 8 g protein',
    )
  })

  it('offers no day after tomorrow, and runs back without a bound', async () => {
    await renderSuspended(DayLookupSection)

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

  it('says plainly that nothing was logged on a day with no Entries', async () => {
    await renderSuspended(DayLookupSection)
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 6, 2026' }),
    )

    const panel = await screen.findByRole('region', { name: 'Tue 6 Oct' })
    expect(
      within(panel).getByText('Nothing logged on Tue 6 Oct.', { exact: true }),
    ).toBeVisible()
    expect(within(panel).queryByRole('list')).not.toBeInTheDocument()
    expect(within(panel).queryByText(/entries ·/)).not.toBeInTheDocument()
  })

  it('says a picked day failed to load, keeps the calendar, and retries it', async () => {
    let failing = true
    server.use(
      failingRead('/api/entries', () => failing),
      ...dailyLogs({ '2026-10-08': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderSuspended(DayLookupSection)
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )

    expect(
      await screen.findByRole('heading', {
        name: "Couldn't load Thu 8 Oct",
        level: 3,
      }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    ).toBeVisible()
    expect(screen.queryByText(/Nothing logged/)).not.toBeInTheDocument()

    failing = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    const panel = await screen.findByRole('region', { name: 'Thu 8 Oct' })
    expect(within(panel).getByText('1 entry · 233 kcal')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: "Couldn't load Thu 8 Oct" }),
    ).not.toBeInTheDocument()
  })

  it('marks the day busy while a newly picked one loads', async () => {
    await renderSuspended(DayLookupSection)
    await screen.findByText('Nothing logged on Mon 12 Oct.')
    const user = userEvent.setup()
    const read = held('get', '/api/entries')
    server.use(read.handler)

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )
    await read.arrived

    // Today is still what is on screen while Thursday is on its way.
    expect(
      screen.getByRole('region', { name: 'Today · Mon 12 Oct' }),
    ).toHaveAttribute('aria-busy', 'true')

    read.release()
    await vi.waitFor(() =>
      expect(screen.getByRole('region', { name: 'Thu 8 Oct' })).toHaveAttribute(
        'aria-busy',
        'false',
      ),
    )
  })

  it('heads the panel by the day it shows until a newly picked one arrives', async () => {
    server.use(
      ...dailyLogs({
        '2026-10-08': [weighed(1, 'Oats', 60, 233, 8)],
      }),
    )
    await renderSuspended(DayLookupSection)
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )
    await screen.findByRole('region', { name: 'Thu 8 Oct' })

    const read = held('get', '/api/entries')
    server.use(read.handler)
    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 6, 2026' }),
    )
    await read.arrived

    // Thursday's Oats are still on screen, so the panel still says Thursday.
    const shown = screen.getByRole('region', { name: 'Thu 8 Oct' })
    expect(within(shown).getByText('1 entry · 233 kcal')).toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Tue 6 Oct' }),
    ).not.toBeInTheDocument()

    read.release()
    const tuesday = await screen.findByRole('region', { name: 'Tue 6 Oct' })
    expect(
      within(tuesday).getByText('Nothing logged on Tue 6 Oct.', {
        exact: true,
      }),
    ).toBeVisible()
  })

  it('draws the card while its first day is still loading, holding nothing up', async () => {
    const read = held('get', '/api/entries')
    server.use(
      read.handler,
      ...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }),
    )

    const rendered = renderSuspended(DayLookupSection)
    await read.arrived
    await vi.waitFor(() =>
      expect(
        screen.getByRole('region', { name: 'Today · Mon 12 Oct' }),
      ).toHaveAttribute('aria-busy', 'true'),
    )
    // Not yet answered, so it claims neither an empty day nor any Entry.
    expect(screen.queryByText(/Nothing logged/)).not.toBeInTheDocument()

    read.release()
    await rendered
    expect(await screen.findByText('1 entry · 233 kcal')).toBeVisible()
  })

  it('holds a loading skeleton where the first day will go, until it is answered', async () => {
    const read = held('get', '/api/entries')
    server.use(read.handler)

    const rendered = renderSuspended(DayLookupSection)
    await read.arrived
    const panel = await screen.findByRole('region', {
      name: 'Today · Mon 12 Oct',
    })
    expect(within(panel).getByRole('alert', { name: 'loading' })).toBeVisible()

    read.release()
    await rendered
    await screen.findByText('Nothing logged on Mon 12 Oct.')
    expect(
      screen.queryByRole('alert', { name: 'loading' }),
    ).not.toBeInTheDocument()
  })

  it('moves today, tomorrow and the last pickable day on when the day turns over', async () => {
    await renderSuspended(DayLookupSection)
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

  it('offers no delete and states no Budget or verdict, today included', async () => {
    server.use(...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }))
    await renderSuspended(DayLookupSection)

    const panel = screen.getByRole('region', { name: 'Today · Mon 12 Oct' })
    expect(await within(panel).findByRole('listitem')).toHaveTextContent('Oats')
    expect(within(panel).queryByRole('button')).not.toBeInTheDocument()
    expect(within(panel).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(panel).queryByText(/budget|left|over|under/i)).toBeNull()
  })
})
