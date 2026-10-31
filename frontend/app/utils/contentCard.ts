/**
 * Each content card subject and the icon its band draws — DESIGN.md → Content
 * card's subject → icon table, in code.
 */
export const CONTENT_CARD_SUBJECTS = {
  weight: 'i-lucide-scale',
  targets: 'i-lucide-gauge',
  today: 'i-lucide-sun',
  tomorrow: 'i-lucide-sunrise',
  goal: 'i-lucide-target',
  weightTimeline: 'i-lucide-chart-line',
  history: 'i-lucide-calendar',
  intakeBreakdown: 'i-lucide-chart-pie',
  micronutrients: 'i-lucide-leaf',
  weeklyReviews: 'i-lucide-history',
  details: 'i-lucide-user-round',
  reminder: 'i-lucide-bell',
  appearance: 'i-lucide-sun-moon',
} as const satisfies Record<string, `i-lucide-${string}`>

export type ContentCardSubject = keyof typeof CONTENT_CARD_SUBJECTS
