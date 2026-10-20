import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { markedDays } from '~~/test/calendar-marks'
import AppCalendar from './AppCalendar.vue'

describe('AppCalendar', () => {
  it('starts every week on a Monday', async () => {
    // 1 Oct 2026 is a Thursday: a Monday-first grid opens on 28 Sep, a
    // Sunday-first one on 27 Sep.
    await renderSuspended(AppCalendar, { props: { modelValue: '2026-10-08' } })

    const days = screen.getAllByRole('button', { name: /^\w+day, / })

    expect(days[0]).toHaveAccessibleName('Monday, September 28, 2026')
    expect(days[6]).toHaveAccessibleName('Sunday, October 4, 2026')
  })

  it('pages by month and offers no year controls', async () => {
    await renderSuspended(AppCalendar, { props: { modelValue: '2026-10-08' } })

    expect(screen.getByRole('button', { name: 'Previous month' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next month' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'Previous year' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Next year' }),
    ).not.toBeInTheDocument()
  })

  it('drills from the heading to the month view, then the year view', async () => {
    await renderSuspended(AppCalendar, { props: { modelValue: '2026-10-08' } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'October 2026' }))
    expect(screen.getByRole('button', { name: 'March 2026' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '2026' }))
    expect(screen.getByRole('button', { name: '2020' })).toBeVisible()
    expect(screen.getByRole('button', { name: '2031' })).toBeVisible()
    expect(
      screen.queryByRole('button', { name: 'March 2026' }),
    ).not.toBeInTheDocument()
  })

  it('disables the days outside its min and max, and only those', async () => {
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', min: '2026-10-05', max: '2026-10-20' },
    })

    const day = (name: string) => screen.getByRole('button', { name })
    expect(day('Sunday, October 4, 2026')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(day('Monday, October 5, 2026')).not.toHaveAttribute('aria-disabled')
    expect(day('Tuesday, October 20, 2026')).not.toHaveAttribute(
      'aria-disabled',
    )
    expect(day('Wednesday, October 21, 2026')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('drops a bound that is not an ISO date, and still renders', async () => {
    // A malformed value must cost the bound, not the page: this renders inside
    // an SPA with no error boundary above it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', min: '2026-10-05T00:00', max: '' },
    })

    expect(
      screen.getByRole('button', { name: 'Sunday, October 4, 2026' }),
    ).not.toHaveAttribute('aria-disabled')
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('emits the ISO date of the day the User picks', async () => {
    const onUpdate = vi.fn()
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', 'onUpdate:modelValue': onUpdate },
    })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 15, 2026' }),
    )

    expect(onUpdate).toHaveBeenCalledExactlyOnceWith('2026-10-15')
  })

  it('keeps the selected day selected when the User picks it again', async () => {
    const onUpdate = vi.fn()
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', 'onUpdate:modelValue': onUpdate },
    })
    const user = userEvent.setup()
    const selected = screen.getByRole('button', {
      name: 'Thursday, October 8, 2026',
    })

    await user.click(selected)

    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByRole('gridcell', { selected: true })).toContainElement(
      selected,
    )
  })

  it('raises no error when the User picks the selected day again', async () => {
    const errors: unknown[] = []
    useNuxtApp().hook('vue:error', (error) => {
      errors.push(error)
    })
    await renderSuspended(AppCalendar, { props: { modelValue: '2026-10-08' } })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )

    expect(errors).toEqual([])
  })

  it('reports the six weeks it draws as soon as it opens', async () => {
    const onShown = vi.fn()
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', onShown },
    })

    expect(onShown.mock.calls).toEqual([
      [{ from: '2026-09-28', to: '2026-11-08' }],
    ])
  })

  it('reports exactly the days it draws, first cell to last', async () => {
    const onShown = vi.fn()
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', onShown },
    })

    const days = screen
      .getAllByRole('button', { name: /^\w+day, / })
      .map((day) => day.getAttribute('aria-label'))
    expect(days).toHaveLength(42)
    expect([days[0], days.at(-1)]).toEqual([
      'Monday, September 28, 2026',
      'Sunday, November 8, 2026',
    ])
    expect(onShown).toHaveBeenLastCalledWith({
      from: '2026-09-28',
      to: '2026-11-08',
    })
  })

  it('reports the six weeks of each month the User pages to, across a year end', async () => {
    const onShown = vi.fn()
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-12-08', onShown },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))

    expect(onShown.mock.calls).toEqual([
      [{ from: '2026-11-30', to: '2027-01-10' }],
      [{ from: '2026-12-28', to: '2027-02-07' }],
      [{ from: '2026-11-30', to: '2027-01-10' }],
      [{ from: '2026-10-26', to: '2026-12-06' }],
    ])
  })

  it('reports nothing new while the User moves between days of the shown month', async () => {
    const onShown = vi.fn()
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', onShown },
    })
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'Thursday, October 8, 2026' }),
    )
    await user.keyboard('{ArrowRight}{ArrowDown}')
    expect(
      screen.getByRole('button', { name: 'Friday, October 16, 2026' }),
    ).toHaveFocus()
    await user.click(
      screen.getByRole('button', { name: 'Tuesday, October 20, 2026' }),
    )

    expect(onShown).toHaveBeenCalledOnce()
  })

  it('dots each day with Entries and no other', async () => {
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', logged: ['2026-10-07', '2026-10-09'] },
    })

    expect(markedDays('entries')).toEqual([
      'Wednesday, October 7, 2026',
      'Friday, October 9, 2026',
    ])
  })

  it('keys both marks in a legend under the days', async () => {
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', weighed: [], logged: [] },
    })

    // The legend repeats what the marks draw, so it is hidden from assistive
    // tech and has no accessible form to query by.
    const legend = screen.queryByTestId('calendar-legend')
    expect(legend).toHaveAttribute('aria-hidden', 'true')
    expect(legend).toHaveTextContent(/^Entries\s*Weigh-in$/)
  })

  it('keys only the weigh-in mark when it draws no Entries', async () => {
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', weighed: [] },
    })

    expect(screen.queryByTestId('calendar-legend')).toHaveTextContent(
      /^Weigh-in$/,
    )
  })

  it('keys only the Entries mark when it draws no weigh-ins', async () => {
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', logged: [] },
    })

    expect(screen.queryByTestId('calendar-legend')).toHaveTextContent(
      /^Entries$/,
    )
  })

  it('draws no legend when it marks nothing', async () => {
    await renderSuspended(AppCalendar, { props: { modelValue: '2026-10-08' } })

    expect(screen.queryByTestId('calendar-legend')).not.toBeInTheDocument()
  })

  it('rings each weighed day and no other', async () => {
    await renderSuspended(AppCalendar, {
      props: {
        modelValue: '2026-10-08',
        weighed: ['2026-10-06', '2026-10-09'],
      },
    })

    expect(markedDays('weigh-in')).toEqual([
      'Tuesday, October 6, 2026',
      'Friday, October 9, 2026',
    ])
  })
})
