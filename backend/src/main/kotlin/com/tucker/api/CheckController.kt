package com.tucker.api

import com.tucker.service.CheckOutcome
import com.tucker.service.CheckService
import com.tucker.service.CheckedProduct
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * A Check on the wire (ADR 0022): the scanned product, the day's targets it is
 * measured against, and the portion-invariant rules stated per 100 g. The client
 * scales cost and return to a portion; it re-derives nothing.
 */
data class CheckResponse(
    val name: String,
    val barcode: String,
    /**
     * The Provider the figures came from, so the screen can carry the ODbL
     * attribution ADR 0006 requires. Null for a Food from the user's own catalog.
     */
    val source: String?,
    /** Atwater-derived, like every Food's — a Provider's stated energy is never used. */
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    /**
     * How the Food's own calories divide between its macros. Shown, never judged:
     * Tucker is diet-agnostic and sets no target for carbs or fat (CONTEXT.md).
     */
    val proteinEnergyShare: Double?,
    val carbsEnergyShare: Double?,
    val fatEnergyShare: Double?,
    /** The whole day's targets — never what today has left (ADR 0022). */
    val calorieBudgetKcal: Double,
    val proteinFloorG: Double,
    /** 100 g as a share of the Calorie Budget, and of the Protein Floor. */
    val costSharePer100g: Double,
    val returnSharePer100g: Double,
    /** `Protein Floor ÷ Calorie Budget × 100`, and the Food's own figure against it. */
    val paceGPer100Kcal: Double,
    val proteinPer100Kcal: Double?,
    /** The protein 100 g leaves the rest of the day to make up; 0 at or above pace. */
    val balanceProteinPer100gG: Double,
    /** A whole day of nothing but this Food. Both null for a Food with no calories. */
    val gramsInBudget: Double?,
    val wholeDayProteinShortfallG: Double?,
)

private fun CheckedProduct.toResponse(): CheckResponse {
    val shares = nutrition.macroEnergyShares()
    return CheckResponse(
        name = name,
        barcode = barcode,
        source = source,
        caloriesPer100g = nutrition.caloriesPer100g,
        proteinPer100g = nutrition.proteinPer100g,
        carbsPer100g = nutrition.carbsPer100g,
        fatPer100g = nutrition.fatPer100g,
        proteinEnergyShare = shares.protein,
        carbsEnergyShare = shares.carbs,
        fatEnergyShare = shares.fat,
        calorieBudgetKcal = check.calorieBudgetKcal,
        proteinFloorG = check.proteinFloorG,
        costSharePer100g = check.costSharePer100g,
        returnSharePer100g = check.returnSharePer100g,
        paceGPer100Kcal = check.pace.gPer100Kcal,
        proteinPer100Kcal = check.proteinPer100Kcal,
        balanceProteinPer100gG = check.balanceProteinPer100gG,
        gramsInBudget = check.gramsInBudget,
        wholeDayProteinShortfallG = check.wholeDayProteinShortfallG,
    )
}

@RestController
@RequestMapping("/api/check")
class CheckController(private val checks: CheckService) {

    /**
     * Check [barcode] against the day's targets. The failure cases are kept
     * distinct because they need opposite advice and the message is the whole
     * failure experience here (ADR 0022): `404` when nothing knows the product,
     * `422` when a Provider knows it but its nutrition can never yield a Check,
     * and `409` before setup has produced a Calorie Budget.
     */
    @GetMapping("/{barcode}")
    fun check(@PathVariable barcode: String): CheckResponse =
        when (val outcome = checks.check(barcode)) {
            is CheckOutcome.Stated -> outcome.product.toResponse()
            is CheckOutcome.Incomplete -> throw UnprocessableException(
                "${outcome.source} has no complete nutrition for ${outcome.name}, " +
                    "so Tucker can't say what it costs",
            )
            CheckOutcome.Unknown -> throw barcodeNotFound(barcode)
        }
}
