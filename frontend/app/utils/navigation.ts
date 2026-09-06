export interface NavDestination {
  /** Label shown in the navigation. */
  label: string
  /** Route the destination links to. */
  to: string
  /** Iconify icon name, rendered via Nuxt UI's UIcon. */
  icon: string
  /**
   * Shown only while the User counts calories (CONTEXT.md — Calorie Tracking).
   * Marks a destination whose whole subject is the log — including a Check,
   * every figure of which is a share of a Calorie Budget or a Protein Floor
   * that a Weekly Review run with tracking off does not derive (ADR 0024).
   */
  requiresCalorieTracking?: boolean
}

/**
 * The three destinations the tab bar carries — Today (F2), Log (F16) and
 * Review (F5). Three because a phone tab bar is a budget, and logging is the
 * thing done ten times a day (ADR 0028).
 */
const primary: NavDestination[] = [
  { label: 'Today', to: '/', icon: 'i-lucide-house' },
  {
    label: 'Log',
    to: '/log',
    icon: 'i-lucide-circle-plus',
    requiresCalorieTracking: true,
  },
  { label: 'Review', to: '/review', icon: 'i-lucide-trending-down' },
]

/**
 * The destinations behind `More` — Foods (F3), Check (F11) and Profile (F4).
 * Check sits here as its entry point rather than as a holding position: it was
 * given a tab on a shop-reachability argument the feature did not earn
 * (ADR 0028, amending ADR 0022).
 */
const overflow: NavDestination[] = [
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

/** What the app shell renders: the tab bar's three, and what `More` holds. */
export interface NavShell {
  primary: NavDestination[]
  overflow: NavDestination[]
}

/**
 * The two groups to show a User whose Calorie Tracking is [tracksCalories].
 * The hidden routes stay reachable — hiding a tab is a navigation choice, not
 * access control, and a User who tracked before still owns their Foods.
 */
export function visibleDestinations(tracksCalories: boolean): NavShell {
  const shown = (d: NavDestination) =>
    tracksCalories || !d.requiresCalorieTracking
  return { primary: primary.filter(shown), overflow: overflow.filter(shown) }
}
