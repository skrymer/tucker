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

/** The calendar days carrying a dot, by their accessible names. */
function dottedDays() {
  return screen
    .getAllByRole('button', { name: /^\w+day, / })
    .filter((day) => day.querySelector('[data-slot="base"]'))
    .map((day) => day.getAttribute('aria-label'))
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

  it('dots the days that hold Entries, and no other', async () => {
    server.use(
      ...dailyLogs({
        '2026-10-07': [weighed(1, 'Oats', 60, 233, 8)],
        '2026-10-08': [weighed(2, 'Banana', 120, 107, 1.3)],
      }),
    )
    await renderSuspended(DayLookupSection)
    await screen.findByText('Nothing logged on Mon 12 Oct.')

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual([
        'Wednesday, October 7, 2026',
        'Thursday, October 8, 2026',
      ]),
    )
  })

  it('dots the logged days of a month paged to', async () => {
    // 10 Sep lies outside the six weeks October draws, so only a read of
    // September's own grid can dot it.
    server.use(...dailyLogs({ '2026-09-10': [weighed(1, 'Oats', 60, 233, 8)] }))
    await renderSuspended(DayLookupSection)
    await screen.findByText('Nothing logged on Mon 12 Oct.')
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Previous month' }))

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Thursday, September 10, 2026']),
    )
  })

  it('keeps the dots of a month already read, paging back to it', async () => {
    // Each month's logged day lies outside the other's grid.
    server.use(
      ...dailyLogs({
        '2026-09-10': [weighed(1, 'Oats', 60, 233, 8)],
        '2026-10-12': [weighed(2, 'Banana', 120, 107, 1.3)],
      }),
    )
    await renderSuspended(DayLookupSection)
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

  it('offers no day before the first Entry', async () => {
    server.use(...dailyLogs({}, { since: '2026-10-05' }))
    await renderSuspended(DayLookupSection)
    const day = (name: string) => screen.getByRole('button', { name })

    await vi.waitFor(() =>
      expect(day('Sunday, October 4, 2026')).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    expect(day('Monday, October 5, 2026')).not.toHaveAttribute('aria-disabled')
  })

  it('does not page back past the month of the first Entry', async () => {
    // Characterises UCalendar: a min value disables paging before its month.
    server.use(...dailyLogs({}, { since: '2026-10-05' }))
    await renderSuspended(DayLookupSection)

    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Previous month' }),
      ).toBeDisabled(),
    )
  })

  it('says nothing is logged yet in place of the calendar, for a User with no Entries', async () => {
    server.use(...dailyLogs({}, { since: null }))
    await renderSuspended(DayLookupSection)

    expect(await screen.findByText('Nothing logged yet')).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Previous month' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Monday, October 12, 2026' }),
    ).not.toBeInTheDocument()
  })

  it('says the logged days failed to load beside the picked day, and retries them', async () => {
    let failing = true
    server.use(
      failingRead('/api/entries/days', () => failing),
      ...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderSuspended(DayLookupSection)
    const user = userEvent.setup()

    expect(
      await screen.findByRole('heading', {
        name: "Couldn't load logged days",
        level: 3,
      }),
    ).toBeVisible()
    const panel = await screen.findByRole('region', {
      name: 'Today · Mon 12 Oct',
    })
    expect(within(panel).getByText('1 entry · 233 kcal')).toBeVisible()
    expect(dottedDays()).toEqual([])

    failing = false
    await user.click(screen.getByRole('button', { name: 'Retry' }))

    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Monday, October 12, 2026']),
    )
    expect(
      screen.queryByRole('heading', { name: "Couldn't load logged days" }),
    ).not.toBeInTheDocument()
    expect(within(panel).getByText('1 entry · 233 kcal')).toBeVisible()
  })

  it('shows no day at all for a User with no Entries', async () => {
    server.use(...dailyLogs({}, { since: null }))
    await renderSuspended(DayLookupSection)

    await screen.findByText('Nothing logged yet')
    expect(
      screen.queryByRole('heading', { name: 'Today · Mon 12 Oct' }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Nothing logged on/)).not.toBeInTheDocument()
  })

  it('says the card failed to load once when both its reads fail, and retries both', async () => {
    let failing = true
    server.use(
      failingRead('/api/entries/days', () => failing),
      failingRead('/api/entries', () => failing),
      ...dailyLogs({ '2026-10-12': [weighed(1, 'Oats', 60, 233, 8)] }),
    )
    await renderSuspended(DayLookupSection)
    const user = userEvent.setup()

    expect(
      await screen.findByRole('heading', {
        name: "Couldn't load this card",
        level: 3,
      }),
    ).toBeVisible()
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1)
    expect(
      screen.queryByRole('heading', { name: "Couldn't load logged days" }),
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
    expect(within(panel).getByText('1 entry · 233 kcal')).toBeVisible()
    await vi.waitFor(() =>
      expect(dottedDays()).toEqual(['Monday, October 12, 2026']),
    )
    expect(
      screen.queryByRole('heading', { name: "Couldn't load this card" }),
    ).not.toBeInTheDocument()
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
    // Decorative: the panel's aria-busy says it is loading, so the rows raise
    // no alert of their own.
    expect(within(panel).getByTestId('day-skeleton')).toBeInTheDocument()
    expect(within(panel).queryByRole('alert')).not.toBeInTheDocument()

    read.release()
    await rendered
    await screen.findByText('Nothing logged on Mon 12 Oct.')
    expect(screen.queryByTestId('day-skeleton')).not.toBeInTheDocument()
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
