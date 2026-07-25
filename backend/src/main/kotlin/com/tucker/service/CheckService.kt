package com.tucker.service

import com.tucker.domain.BarcodeLookup
import com.tucker.domain.Check
import com.tucker.domain.Nutrition
import com.tucker.domain.WeeklyReview
import org.springframework.stereotype.Service

/** A Check together with the product it is about. */
data class CheckedProduct(
    val name: String,
    val barcode: String,
    /**
     * The Provider the figures came from, for the ODbL attribution ADR 0006
     * requires wherever its data is shown. Null for a Food out of the user's own
     * catalog, where none is owed.
     */
    val source: String?,
    val nutrition: Nutrition,
    val check: Check,
)

/**
 * What resolving a barcode into a Check produced. The three cases need opposite
 * advice — retry, give up on this product, or scan something else — and the error
 * message is the *entire* failure experience on a surface with no manual path
 * (ADR 0022), so they are discriminated here rather than collapsed into one
 * status. Telling a Provider outage apart from a genuine [Unknown] is issue #164.
 */
sealed interface CheckOutcome {
    /** The product resolved and its Check is stated. */
    data class Stated(val product: CheckedProduct) : CheckOutcome

    /**
     * A Provider knew the product but not all three macros, so there are no
     * Atwater calories to derive and never will be — absent is never zero
     * (ADR 0006). Permanent for this product: rescanning cannot help.
     */
    data class Incomplete(val name: String, val source: String) : CheckOutcome

    /** Neither the catalog nor any Provider knew the barcode. */
    data object Unknown : CheckOutcome
}

/**
 * Resolves a Check (ADR 0022): the existing barcode lookup composed with the day's
 * targets. It computes nothing about the day itself — the weekly cadence still
 * advances lazily on the daily-summary read (ADR 0010), which the Check screen
 * performs for its own setup gate.
 */
@Service
class CheckService(
    private val barcodeLookup: BarcodeLookupService,
    private val weeklyReview: WeeklyReviewService,
) {

    /** Check [barcode] against the day's targets; see [CheckOutcome] for the cases. */
    fun check(barcode: String): CheckOutcome {
        val review = weeklyReview.recentReviews().firstOrNull()
            ?: error("a Check needs a Calorie Budget; finish setup first")
        // A saved Food always has calories; only a Provider candidate can arrive
        // with a macro missing, and then there is nothing to derive them from.
        return when (val found = barcodeLookup.lookup(barcode)) {
            null -> CheckOutcome.Unknown
            is BarcodeLookup.Existing ->
                state(barcode, found.food.name, source = null, found.food.nutrition, review)
            is BarcodeLookup.Candidate ->
                found.candidate.atwaterNutrition()
                    ?.let { state(barcode, found.candidate.name, found.candidate.source, it, review) }
                    ?: CheckOutcome.Incomplete(found.candidate.name, found.candidate.source)
        }
    }

    private fun state(
        barcode: String,
        name: String,
        source: String?,
        nutrition: Nutrition,
        review: WeeklyReview,
    ) = CheckOutcome.Stated(
        CheckedProduct(
            name = name,
            barcode = barcode,
            source = source,
            nutrition = nutrition,
            check = Check.of(
                nutrition,
                calorieBudgetKcal = review.calorieBudgetKcal,
                proteinFloorG = review.proteinFloorG,
            ),
        ),
    )
}
