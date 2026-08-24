import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ProfileForm from './ProfileForm.vue'
import { localYesterday } from '~/utils/date'

const SAVED = { sex: 'MALE', birthDate: '1990-06-15', heightCm: 180 }

describe('ProfileForm', () => {
  it('shows sex, birth date, height, and a save button', async () => {
    await renderSuspended(ProfileForm)

    expect(screen.getByRole('radio', { name: /^male$/i })).toBeVisible()
    expect(screen.getByRole('radio', { name: /^female$/i })).toBeVisible()
    expect(screen.getByLabelText(/birth date/i)).toBeVisible()
    expect(screen.getByLabelText(/height/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /save profile/i })).toBeVisible()
  })

  it('opens a calendar from the birth-date field rather than asking for typing', async () => {
    await renderSuspended(ProfileForm)
    const user = userEvent.setup()

    await user.click(screen.getByLabelText(/birth date/i))

    expect(await screen.findByRole('dialog')).toBeVisible()
  })

  it('emits the birth date the user picked from the calendar', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: { initial: SAVED, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByLabelText(/birth date/i))
    await user.click(
      await screen.findByRole('button', { name: /June 20, 1990/ }),
    )
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      sex: 'MALE',
      birthDate: '1990-06-20',
      heightCm: 180,
      tracksCalories: true,
    })
  })

  it('emits FEMALE when the user chooses Female', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, sex: '' }, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: /^female$/i }))
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      sex: 'FEMALE',
      birthDate: SAVED.birthDate,
      heightCm: SAVED.heightCm,
      tracksCalories: true,
    })
  })

  it('announces the saved birth date, not just the name of the field', async () => {
    // The field's <label for> wins the trigger's accessible name, so the value
    // reaches assistive tech as a description — the <input type="date"> this
    // replaced announced both.
    await renderSuspended(ProfileForm, { props: { initial: SAVED } })

    expect(
      screen.getByRole('button', { name: /birth date/i }),
    ).toHaveAccessibleDescription('15 Jun 1990')
  })

  it('emits MALE when the user chooses Male', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, sex: '' }, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: /^male$/i }))
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      sex: 'MALE',
      birthDate: SAVED.birthDate,
      heightCm: SAVED.heightCm,
      tracksCalories: true,
    })
  })

  it('requires a sex selection', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, sex: '' }, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText('Choose your sex')).toBeVisible()
    expect(screen.queryByText('Enter your birth date')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Birth date must be in the past'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Enter your height in cm'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be greater than 0'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be less than 300'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires a birth date', async () => {
    // Rendered with no `initial` at all — the first-run case, which is what
    // seeds the field empty rather than the prop doing it.
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: /^male$/i }))
    await user.type(screen.getByLabelText(/height/i), '180')
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText('Enter your birth date')).toBeVisible()
    expect(screen.queryByText('Choose your sex')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Birth date must be in the past'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Enter your height in cm'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be greater than 0'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be less than 300'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('clears the birth-date error as soon as a date is picked', async () => {
    // An empty field opens the calendar on today, so pin the day to name a
    // cell the grid is actually showing.
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(2026, 5, 20, 9, 0))
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, birthDate: '' } },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))
    expect(await screen.findByText('Enter your birth date')).toBeVisible()

    await user.click(screen.getByLabelText(/birth date/i))
    await user.click(
      await screen.findByRole('button', { name: /June 15, 2026/ }),
    )

    expect(screen.queryByText('Enter your birth date')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('accepts yesterday, the latest birth date that is still in the past', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, birthDate: localYesterday() }, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(
      screen.queryByText('Birth date must be in the past'),
    ).not.toBeInTheDocument()
    expect(onSubmit).toHaveBeenCalledWith({
      sex: SAVED.sex,
      birthDate: localYesterday(),
      heightCm: SAVED.heightCm,
      tracksCalories: true,
    })
  })

  it('rejects a saved birth date that is today or in the future', async () => {
    // The picker cannot produce one — its latest selectable day is yesterday —
    // so this backstop only fires on a value that arrived from the API. Pick a
    // date guaranteed to be in the future for the lifetime of this app.
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, birthDate: '2999-12-31' }, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText('Birth date must be in the past')).toBeVisible()
    expect(screen.queryByText('Choose your sex')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter your birth date')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Enter your height in cm'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be greater than 0'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be less than 300'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('requires a height', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, { props: { initial: SAVED, onSubmit } })
    const user = userEvent.setup()

    // Cleared rather than seeded: `initial.heightCm` is a number, so an absent
    // height is the one case the prop can't express.
    await user.clear(screen.getByLabelText(/height/i))
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText('Enter your height in cm')).toBeVisible()
    expect(screen.queryByText('Choose your sex')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter your birth date')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Birth date must be in the past'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be greater than 0'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be less than 300'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a height of zero', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, heightCm: 0 }, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText('Height must be greater than 0')).toBeVisible()
    expect(screen.queryByText('Choose your sex')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter your birth date')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Birth date must be in the past'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Enter your height in cm'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be less than 300'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a height of 300 or more', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, heightCm: 300 }, onSubmit },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(screen.getByText('Height must be less than 300')).toBeVisible()
    expect(screen.queryByText('Choose your sex')).not.toBeInTheDocument()
    expect(screen.queryByText('Enter your birth date')).not.toBeInTheDocument()
    expect(
      screen.queryByText('Birth date must be in the past'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Enter your height in cm'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Height must be greater than 0'),
    ).not.toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('prefills the fields when given saved profile values', async () => {
    await renderSuspended(ProfileForm, {
      props: {
        initial: { sex: 'FEMALE', birthDate: '1985-03-22', heightCm: 168 },
      },
    })

    expect(screen.getByRole('radio', { name: /^female$/i })).toBeChecked()
    expect(screen.getByLabelText(/birth date/i)).toHaveTextContent(
      '22 Mar 1985',
    )
    expect(screen.getByLabelText(/height/i)).toHaveValue(168)
  })

  it('emits the unchanged payload when the user saves a prefilled form', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, {
      props: {
        initial: { sex: 'FEMALE', birthDate: '1985-03-22', heightCm: 168 },
        onSubmit,
      },
    })
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      sex: 'FEMALE',
      birthDate: '1985-03-22',
      heightCm: 168,
      tracksCalories: true,
    })
  })
  it('pre-selects Calories and weight for a User who has never chosen', async () => {
    // Rendered with no `initial` at all — the first-run case, and the one the
    // default is *for*: Tucker is the full diet tracker unless told otherwise.
    await renderSuspended(ProfileForm)

    expect(
      screen.getByRole('radio', { name: /calories and weight/i }),
    ).toBeChecked()
    expect(
      screen.getByRole('radio', { name: /weight only/i }),
    ).not.toBeChecked()
  })
  it('emits Calorie Tracking off when the user chooses Weight only', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, { props: { initial: SAVED, onSubmit } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: /weight only/i }))
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      ...SAVED,
      tracksCalories: false,
    })
  })
  it('pre-selects Weight only for a User who has turned Calorie Tracking off', async () => {
    await renderSuspended(ProfileForm, {
      props: { initial: { ...SAVED, tracksCalories: false } },
    })

    expect(screen.getByRole('radio', { name: /weight only/i })).toBeChecked()
    expect(
      screen.getByRole('radio', { name: /calories and weight/i }),
    ).not.toBeChecked()
  })
  it('says what each tracking option means, not just what it is called', async () => {
    // The descriptions are why this is two named options and not a switch:
    // without them "Weight only" reads as a feature being taken away rather
    // than as a coherent way to use Tucker.
    await renderSuspended(ProfileForm)

    expect(
      screen.getByText(/against a calorie budget and a protein floor/i),
    ).toBeVisible()
    expect(screen.getByText(/tucker never asks what you ate/i)).toBeVisible()
  })
})
