import type { BudgetWarning } from '~/composables/useBudgetGate'

/**
 * The over-budget heads-up copy (CONTEXT.md — Budget Projection): how far logging
 * the prospective Entry would push the day past the Calorie Budget, rounded to whole
 * calories — or `null` when within budget. Shared by every entry form (Weighed,
 * Estimated) so the wording can't drift between them. The over-budget verdict and
 * figures are the backend's; this only phrases them (ADR 0002).
 */
export function formatBudgetWarning(
  warning: BudgetWarning | null | undefined,
): string | null {
  return warning
    ? `This puts you ~${Math.round(warning.overByKcal)} kcal over your ${Math.round(warning.calorieBudget)} budget.`
    : null
}
