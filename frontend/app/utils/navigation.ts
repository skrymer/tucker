export interface NavDestination {
  /** Label shown in the navigation. */
  label: string
  /** Route the destination links to. */
  to: string
  /** Iconify icon name, rendered via Nuxt UI's UIcon. */
  icon: string
  /**
   * Shown only while the User counts calories (CONTEXT.md — Calorie Tracking).
   * Marks a destination whose whole subject is the log: the catalog is never
   * logged against, and a Check answers a shopping question about a day's intake
   * this User is not keeping. Not because there is no Calorie Budget — the
   * backend still derives one for them.
   */
  requiresCalorieTracking?: boolean
}

/**
 * Tucker's five primary destinations. One per roadmap area: Today (F2), Foods
 * (F3), Check (F11), Review (F5), Profile (F4) — see CLAUDE.md. Check earns a
 * tab of its own because it creates nothing (ADR 0022, which amends 0006's "no
 * new nav tab"); in a shop, one-handed reachability decides it.
 *
 * The full set. What the app shell renders is [visibleDestinations], which
 * narrows it to the User.
 */
export const navDestinations: NavDestination[] = [
  { label: 'Today', to: '/', icon: 'i-lucide-house' },
  {
    label: 'Foods',
    to: '/foods',
    icon: 'i-lucide-apple',
    requiresCalorieTracking: true,
  },
  {
    label: 'Check',
    to: '/check',
    icon: 'i-lucide-scan-search',
    requiresCalorieTracking: true,
  },
  { label: 'Review', to: '/review', icon: 'i-lucide-trending-down' },
  { label: 'Profile', to: '/profile', icon: 'i-lucide-user' },
]

/**
 * Whether a nav destination should read as the active route for the current
 * path.
 */
export function isDestinationActive(to: string, path: string): boolean {
  // A destination is active on its own route and on any nested child (e.g.
  // Profile stays active on /profile/weight), matched on a path-segment
  // boundary so a string-prefix sibling can't light it up.
  //
  // The Today root is exact-only. That boundary match spells out to
  // `path.startsWith('//')` for it, which no ordinary route satisfies — but a
  // stray doubled slash does, and would light Today up on somebody else's page.
  if (to === '/') return path === '/'
  return path === to || path.startsWith(`${to}/`)
}

/**
 * The destinations to show a User whose Calorie Tracking is [tracksCalories].
 * The hidden routes stay reachable — hiding a tab is a navigation choice, not
 * access control, and a User who tracked before still owns their Foods.
 */
export function visibleDestinations(tracksCalories: boolean): NavDestination[] {
  return navDestinations.filter(
    (d) => tracksCalories || !d.requiresCalorieTracking,
  )
}
