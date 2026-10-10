import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
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

  it('emits each month the User pages to, across a year end', async () => {
    const onPaged = vi.fn()
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-12-08', onPaged },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Next month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await user.click(screen.getByRole('button', { name: 'Previous month' }))

    expect(onPaged.mock.calls).toEqual([['2027-01'], ['2026-12'], ['2026-11']])
  })

  it('reports no page while the User moves between days of the shown month', async () => {
    const onPaged = vi.fn()
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', onPaged },
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

    expect(onPaged).not.toHaveBeenCalled()
  })

  it('announces a marked day as having Entries, and an unmarked one as nothing', async () => {
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', marked: ['2026-10-07', '2026-10-09'] },
    })

    const day = (name: string) => screen.getByRole('button', { name })
    expect(day('Wednesday, October 7, 2026')).toHaveAccessibleDescription(
      'Has Entries',
    )
    expect(day('Friday, October 9, 2026')).toHaveAccessibleDescription(
      'Has Entries',
    )
    expect(day('Thursday, October 8, 2026')).toHaveAccessibleDescription('')
  })

  it('still announces a mark after a drill to the month view and back', async () => {
    await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', marked: ['2026-10-07'] },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'October 2026' }))
    await user.click(screen.getByRole('button', { name: 'October 2026' }))

    await vi.waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Wednesday, October 7, 2026' }),
      ).toHaveAccessibleDescription('Has Entries'),
    )
  })

  it('announces marks that arrive after it renders, and drops withdrawn ones', async () => {
    const { rerender } = await renderSuspended(AppCalendar, {
      props: { modelValue: '2026-10-08', marked: ['2026-10-07'] },
    })

    await rerender({ modelValue: '2026-10-08', marked: ['2026-10-09'] })

    const day = (name: string) => screen.getByRole('button', { name })
    await vi.waitFor(() =>
      expect(day('Friday, October 9, 2026')).toHaveAccessibleDescription(
        'Has Entries',
      ),
    )
    expect(day('Wednesday, October 7, 2026')).toHaveAccessibleDescription('')
  })
})
