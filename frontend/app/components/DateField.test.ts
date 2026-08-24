import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import { defineComponent } from 'vue'
import { UFormField } from '#components'
import DateField from './DateField.vue'

describe('DateField', () => {
  it('shows the selected date on the trigger', async () => {
    await renderSuspended(DateField, { props: { modelValue: '1984-03-12' } })

    expect(screen.getByRole('button', { name: /12 Mar 1984/i })).toBeVisible()
  })

  it('prompts to choose when no date is set yet', async () => {
    await renderSuspended(DateField, { props: { modelValue: '' } })

    expect(screen.getByRole('button', { name: /choose a date/i })).toBeVisible()
  })

  it('emits the ISO date of the day the user picks', async () => {
    const onUpdate = vi.fn()
    await renderSuspended(DateField, {
      props: { modelValue: '1984-03-12', 'onUpdate:modelValue': onUpdate },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /12 Mar 1984/i }))
    await user.click(
      await screen.findByRole('button', { name: /March 15, 1984/ }),
    )

    expect(onUpdate).toHaveBeenCalledWith('1984-03-15')
  })

  it('refuses a day after the latest allowed date', async () => {
    const onUpdate = vi.fn()
    await renderSuspended(DateField, {
      props: {
        modelValue: '2026-05-20',
        max: '2026-05-25',
        'onUpdate:modelValue': onUpdate,
      },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /20 May 2026/i }))
    const beyond = await screen.findByRole('button', { name: /May 28, 2026/ })

    // Announced as unavailable, not merely inert: a refusal a screen reader
    // can't hear is a day the user keeps trying to tap.
    expect(beyond).toHaveAttribute('aria-disabled', 'true')
    await user.click(beyond)
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /20 May 2026/i })).toBeVisible()
  })

  it('reaches a year decades back through the heading, never stepping months', async () => {
    const onUpdate = vi.fn()
    await renderSuspended(DateField, {
      props: { modelValue: '2026-08-24', 'onUpdate:modelValue': onUpdate },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /24 Aug 2026/i }))
    // The heading is the whole fix: it drills day -> month -> year, so distance
    // is covered a decade at a time instead of a month at a time.
    await user.click(screen.getByRole('button', { name: 'August 2026' }))
    await user.click(screen.getByRole('button', { name: '2026' }))

    // The bound is the assertion. Reaching 1984 by the month control would take
    // ~500 steps; here it is a handful of pages through the year grid.
    let pages = 0
    while (screen.queryByRole('button', { name: '1984' }) === null) {
      expect(pages++).toBeLessThan(6)
      await user.click(screen.getByRole('button', { name: 'Previous year' }))
    }

    await user.click(screen.getByRole('button', { name: '1984' }))
    await user.click(screen.getByRole('button', { name: 'March 1984' }))
    await user.click(
      await screen.findByRole('button', { name: /March 12, 1984/ }),
    )

    expect(onUpdate).toHaveBeenCalledWith('1984-03-12')
  })

  it('names the calendar it opens, so it is not an anonymous dialog', async () => {
    await renderSuspended(DateField, { props: { modelValue: '1984-03-12' } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /12 Mar 1984/i }))

    expect(
      await screen.findByRole('dialog', { name: /choose a date/i }),
    ).toBeVisible()
  })

  it('closes the calendar once a day is picked', async () => {
    await renderSuspended(DateField, { props: { modelValue: '1984-03-12' } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /12 Mar 1984/i }))
    await user.click(
      await screen.findByRole('button', { name: /March 15, 1984/ }),
    )

    expect(
      screen.queryByRole('dialog', { name: /choose a date/i }),
    ).not.toBeInTheDocument()
  })

  it('falls back to the prompt when the stored value is not an ISO date', async () => {
    // A malformed value must cost the field, not the page: this renders inside
    // an SPA with no error boundary above it.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await renderSuspended(DateField, {
      props: { modelValue: '1990-06-15T00:00:00' },
    })

    expect(screen.getByRole('button', { name: /choose a date/i })).toBeVisible()
    // Loud, not swallowed: nothing should ever reach here.
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('appends its value to the help text the field already points at', async () => {
    // The description composes rather than replaces: a field with its own help
    // or error text must keep it and gain the date, space-separated.
    const Wrapper = defineComponent({
      components: { DateField, UFormField },
      template: `
        <UFormField label="Birth date" help="Used to seed your maintenance">
          <DateField model-value="1990-06-15" />
        </UFormField>
      `,
    })

    await renderSuspended(Wrapper)

    expect(
      screen.getByRole('button', { name: /birth date/i }),
    ).toHaveAccessibleDescription('Used to seed your maintenance 15 Jun 1990')
  })

  it('describes nothing, and says nothing, when it holds no date', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await renderSuspended(DateField, { props: { modelValue: '' } })

    expect(
      screen.getByRole('button', { name: /choose a date/i }),
    ).not.toHaveAttribute('aria-describedby')
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
