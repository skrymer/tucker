import { describe, expect, it } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import AppNav from './AppNav.vue'

// The network, not the composable: `AppNav` loads Calorie Tracking itself, so
// stubbing `GET /api/profile` drives the real one (ADR 0013 — mock only the true
// external boundary).
let tracksCalories = true
registerEndpoint('/api/profile', () => ({
  sex: 'MALE',
  birthDate: '1990-06-15',
  heightCm: 180,
  tracksCalories,
}))

const TODAY = { label: 'Today', href: '/' }
const LOG = { label: 'Log', href: '/log' }
const REVIEW = { label: 'Review', href: '/review' }

/**
 * The destinations each navigation offers *outside* its More overflow. Both the
 * side nav and the bottom tab bar are always in the DOM, one hidden by
 * breakpoint, so they are asserted together: a destination dropped from one and
 * not the other is a bug only visible at one viewport.
 */
async function renderBars() {
  await renderSuspended(AppNav)
  return screen.getAllByRole('navigation', { name: 'Primary' }).map((nav) => {
    const more = within(nav).queryByRole('group', { name: 'More' })
    return within(nav)
      .getAllByRole('link')
      .filter((link) => !more?.contains(link))
      .map((link) => ({
        label: link.textContent!.trim(),
        href: link.getAttribute('href'),
      }))
  })
}

/** Open the phone bar's overflow sheet and hand it back. */
async function openMoreSheet(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    within(screen.getByTestId('bottom-nav')).getByRole('button', {
      name: 'More',
    }),
  )
  return screen.findByRole('dialog', { name: 'More' })
}

/** The destinations a container offers, as the routes they link to. */
function linkedRoutes(container: HTMLElement) {
  return within(container)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'))
}

describe('AppNav', () => {
  it('carries Today, Log and Review in both navigations', async () => {
    tracksCalories = true

    const three = [TODAY, LOG, REVIEW]
    expect(await renderBars()).toEqual([three, three])
  })

  it('offers Foods, Check and Profile under More in the side navigation', async () => {
    tracksCalories = true
    await renderSuspended(AppNav)

    expect(linkedRoutes(screen.getByRole('group', { name: 'More' }))).toEqual([
      '/foods',
      '/check',
      '/profile',
    ])
  })

  it('opens the same three onto a sheet from the tab bar', async () => {
    tracksCalories = true
    const user = userEvent.setup()
    await renderSuspended(AppNav)

    const sheet = await openMoreSheet(user)

    expect(linkedRoutes(sheet)).toEqual(['/foods', '/check', '/profile'])
  })

  it('closes the sheet once a destination in it is chosen', async () => {
    tracksCalories = true
    const user = userEvent.setup()
    await renderSuspended(AppNav)
    const sheet = await openMoreSheet(user)

    await user.click(within(sheet).getByRole('link', { name: 'Foods' }))

    // The route changes underneath it, so a sheet left open would dim the page
    // it was used to reach.
    expect(
      screen.queryByRole('dialog', { name: 'More' }),
    ).not.toBeInTheDocument()
  })

  it('drops Log for a User who is not counting calories', async () => {
    tracksCalories = false

    const two = [TODAY, REVIEW]
    expect(await renderBars()).toEqual([two, two])
  })

  it('leaves More holding Profile alone for that User', async () => {
    tracksCalories = false
    await renderSuspended(AppNav)

    expect(linkedRoutes(screen.getByRole('group', { name: 'More' }))).toEqual([
      '/profile',
    ])
  })

  it('marks More as the current page while one of its destinations is open', async () => {
    // Otherwise nothing in the phone bar is lit on /foods, /check or /profile,
    // and the bar stops answering "where am I".
    tracksCalories = true
    await renderSuspended(AppNav, { route: '/profile' })

    expect(
      within(screen.getByTestId('bottom-nav')).getByRole('button', {
        name: 'More',
      }),
    ).toHaveAttribute('aria-current', 'page')
  })

  it('leaves More unmarked while a destination in the bar is open', async () => {
    tracksCalories = true
    await renderSuspended(AppNav, { route: '/review' })

    expect(
      within(screen.getByTestId('bottom-nav')).getByRole('button', {
        name: 'More',
      }),
    ).not.toHaveAttribute('aria-current')
  })

  it('leaves the sheet open on a modified click, which opens a tab instead of navigating', async () => {
    // vue-router declines a cmd/ctrl/shift-click so the browser can open a new
    // tab; closing the sheet then returns the User to a page they did not leave.
    tracksCalories = true
    const user = userEvent.setup()
    await renderSuspended(AppNav)
    const sheet = await openMoreSheet(user)

    await user.keyboard('{Meta>}')
    await user.click(within(sheet).getByRole('link', { name: 'Foods' }))
    await user.keyboard('{/Meta}')

    expect(screen.getByRole('dialog', { name: 'More' })).toBeVisible()
  })
})
