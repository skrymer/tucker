import { describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import AppNav from './AppNav.vue'

describe('AppNav', () => {
  it('links to each of the four primary destinations', async () => {
    const nav = await mountSuspended(AppNav)
    const links = nav.get('[data-testid="side-nav"]').findAll('a')

    expect(links.map((link) => link.text())).toEqual([
      'Today',
      'Foods',
      'Review',
      'Profile',
    ])
    expect(links.map((link) => link.attributes('href'))).toEqual([
      '/',
      '/foods',
      '/review',
      '/profile',
    ])
  })
})
