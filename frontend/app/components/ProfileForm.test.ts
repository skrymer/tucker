import { describe, expect, it, vi } from 'vitest'
import { renderSuspended } from '@nuxt/test-utils/runtime'
import { screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import ProfileForm from './ProfileForm.vue'

describe('ProfileForm', () => {
  it('shows sex, birth date, height, and a save button', async () => {
    await renderSuspended(ProfileForm)

    expect(screen.getByRole('radio', { name: /^male$/i })).toBeVisible()
    expect(screen.getByRole('radio', { name: /^female$/i })).toBeVisible()
    expect(screen.getByLabelText(/birth date/i)).toBeVisible()
    expect(screen.getByLabelText(/height/i)).toBeVisible()
    expect(screen.getByRole('button', { name: /save profile/i })).toBeVisible()
  })

  it('emits the profile payload when the user saves', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: /^male$/i }))
    await user.type(screen.getByLabelText(/birth date/i), '1990-06-15')
    await user.type(screen.getByLabelText(/height/i), '180')
    await user.click(screen.getByRole('button', { name: /save profile/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      sex: 'MALE',
      birthDate: '1990-06-15',
      heightCm: 180,
    })
  })

  it('requires a sex selection', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText(/birth date/i), '1990-06-15')
    await user.type(screen.getByLabelText(/height/i), '180')
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

  it('rejects a birth date that is today or in the future', async () => {
    const onSubmit = vi.fn()
    await renderSuspended(ProfileForm, { props: { onSubmit } })
    const user = userEvent.setup()

    // Pick a date that is guaranteed to be in the future for the lifetime of
    // this app.
    await user.click(screen.getByRole('radio', { name: /^male$/i }))
    await user.type(screen.getByLabelText(/birth date/i), '2999-12-31')
    await user.type(screen.getByLabelText(/height/i), '180')
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
    await renderSuspended(ProfileForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: /^male$/i }))
    await user.type(screen.getByLabelText(/birth date/i), '1990-06-15')
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
    await renderSuspended(ProfileForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: /^male$/i }))
    await user.type(screen.getByLabelText(/birth date/i), '1990-06-15')
    await user.type(screen.getByLabelText(/height/i), '0')
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
    await renderSuspended(ProfileForm, { props: { onSubmit } })
    const user = userEvent.setup()

    await user.click(screen.getByRole('radio', { name: /^male$/i }))
    await user.type(screen.getByLabelText(/birth date/i), '1990-06-15')
    await user.type(screen.getByLabelText(/height/i), '300')
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
    expect(screen.getByLabelText(/birth date/i)).toHaveValue('1985-03-22')
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
    })
  })
})
