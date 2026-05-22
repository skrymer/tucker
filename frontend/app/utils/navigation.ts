export interface NavDestination {
  /** Label shown in the navigation. */
  label: string
  /** Route the destination links to. */
  to: string
  /** Iconify icon name, rendered via Nuxt UI's UIcon. */
  icon: string
}

/**
 * Tucker's four primary destinations, shown in the app shell's adaptive
 * navigation. One per roadmap area: Today (F2), Foods (F3), Review (F5),
 * Profile (F4) — see CLAUDE.md.
 */
export const navDestinations: NavDestination[] = [
  { label: 'Today', to: '/', icon: 'i-lucide-house' },
  { label: 'Foods', to: '/foods', icon: 'i-lucide-apple' },
  { label: 'Review', to: '/review', icon: 'i-lucide-trending-down' },
  { label: 'Profile', to: '/profile', icon: 'i-lucide-user' },
]
