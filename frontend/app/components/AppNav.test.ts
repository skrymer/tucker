import { describe, expect, it } from 'vitest'
import { registerEndpoint, renderSuspended } from '@nuxt/test-utils/runtime'
import { screen, within } from '@testing-library/vue'
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
const FOODS = { label: 'Foods', href: '/foods' }
const CHECK = { label: 'Check', href: '/check' }
const REVIEW = { label: 'Review', href: '/review' }
const PROFILE = { label: 'Profile', href: '/profile' }

/**
 * Both navigations — the side nav and the bottom tab bar — as the destinations
 * each offers. Both are always in the DOM, one hidden by breakpoint, so they are
 * asserted together: a destination dropped from one and not the other is a bug
 * only visible at one viewport.
 */
async function renderNavigations() {
  await renderSuspended(AppNav)
  return screen.getAllByRole('navigation', { name: 'Primary' }).map((nav) =>
    within(nav)
      .getAllByRole('link')
      .map((link) => ({
        label: link.textContent!.trim(),
        href: link.getAttribute('href'),
      })),
  )
}

describe('AppNav', () => {
  it('links to each of the five primary destinations', async () => {
    tracksCalories = true

    const five = [TODAY, FOODS, CHECK, REVIEW, PROFILE]
    expect(await renderNavigations()).toEqual([five, five])
  })

  it('drops Foods and Check for a User who is not counting calories', async () => {
    tracksCalories = false

    const three = [TODAY, REVIEW, PROFILE]
    expect(await renderNavigations()).toEqual([three, three])
  })
})
