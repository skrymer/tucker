import type { components } from '#open-fetch-schemas/api'

type CheckResult = components['schemas']['CheckResponse']

/**
 * Nutella checked against the dev profile's targets — a 2492 kcal Calorie Budget
 * and a 170 g Protein Floor, which imply a pace of 6.8 g protein per 100 kcal.
 * Well below that pace, so it exercises the "balance it elsewhere" copy.
 *
 * Shared by the CheckAnalysis component test and the /check page test so a
 * change to the wire contract is felt in one place.
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
