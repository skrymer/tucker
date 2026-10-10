import type { components } from '#open-fetch-schemas/api'

type CheckResult = components['schemas']['CheckResponse']

/**
 * Nutella checked against the dev profile's targets — a 2492 kcal Calorie Budget
 * and a 170 g Protein Floor, which imply a pace of 6.8 g protein per 100 kcal.
 * Well below that pace, so it exercises the "balance it elsewhere" copy.
 */
export const nutellaCheck: CheckResult = {
  name: 'Nutella',
  barcode: '3017620422003',
  source: 'Open Food Facts',
  caloriesPer100g: 533.3,
  proteinPer100g: 6.3,
  carbsPer100g: 57.5,
  fatPer100g: 30.9,
  calorieBudgetKcal: 2492,
  proteinFloorG: 170,
  costSharePer100g: 0.214,
  returnSharePer100g: 0.037,
  paceGPer100Kcal: 6.82,
  proteinPer100Kcal: 1.18,
  balanceProteinPer100gG: 30.1,
  gramsInBudget: 467.3,
  wholeDayProteinShortfallG: 140.6,
  proteinEnergyShare: 0.047,
  carbsEnergyShare: 0.431,
  fatEnergyShare: 0.521,
}

/**
 * A whey isolate against the same targets — 90 g protein and 10 g fat per 100 g,
 * so 450 kcal by Atwater. Far above pace, so it owes no protein: its balance and
 * whole-day shortfall are zero. A 250 g portion returns 132% of the Floor, the
 * widest a Check ring's figure gets.
 */
export const wheyIsolateCheck: CheckResult = {
  name: 'Whey isolate',
  barcode: '9300601234567',
  source: 'Open Food Facts',
  caloriesPer100g: 450,
  proteinPer100g: 90,
  carbsPer100g: 0,
  fatPer100g: 10,
  calorieBudgetKcal: 2492,
  proteinFloorG: 170,
  costSharePer100g: 450 / 2492,
  returnSharePer100g: 90 / 170,
  paceGPer100Kcal: 6.82,
  proteinPer100Kcal: 20,
  balanceProteinPer100gG: 0,
  gramsInBudget: (2492 / 450) * 100,
  wholeDayProteinShortfallG: 0,
  proteinEnergyShare: 0.8,
  carbsEnergyShare: 0,
  fatEnergyShare: 0.2,
}
