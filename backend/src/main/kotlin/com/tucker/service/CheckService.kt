package com.tucker.service

import com.tucker.domain.BarcodeLookup
import com.tucker.domain.Check
import com.tucker.domain.IntakeTargets
import com.tucker.domain.Nutrition
import com.tucker.persistence.ProfileRepository
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
 * What resolving a barcode into a Check produced. The cases need opposite advice —
 * try again, give up on this product, or scan something else — and the error
 * message is the *entire* failure experience on a surface with no manual path
 * (ADR 0022), so they are discriminated here rather than collapsed into one
 * status.
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

    /** Neither the catalog nor any Provider knew the barcode. Rescanning is futile. */
    data object Unknown : CheckOutcome

    /**
     * Nobody could be asked, so nothing is known about the product either way
     * (issue #164). The one failure here worth retrying — which is why it must
     * never arrive dressed as [Unknown].
     */
    data object Inconclusive : CheckOutcome
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
    private val profiles: ProfileRepository,
) {

    /** Check [barcode] against the day's targets; see [CheckOutcome] for the cases. */
    fun check(barcode: String): CheckOutcome {
        // Two ways to have no Budget, and they earn opposite advice (ADR 0024), so
        // the reason says which. Asked of the Profile rather than of setup: setup
        // being complete would also cover a tracking User whose first review has
        // simply not run yet, and telling them to turn on what is already on is the
        // trap this distinction exists to avoid.
        val targets = weeklyReview.recentReviews().firstOrNull()?.intakeTargets
            ?: error(
                if (profiles.get()?.tracksCalories == false) {
                    "a Check needs a Calorie Budget; turn calorie tracking on"
                } else {
                    "a Check needs a Calorie Budget; finish setup first"
                },
            )
        // A saved Food always has calories; only a Provider candidate can arrive
        // with a macro missing, and then there is nothing to derive them from.
        return when (val found = barcodeLookup.lookup(barcode)) {
            BarcodeLookup.Missing -> CheckOutcome.Unknown
            BarcodeLookup.Inconclusive -> CheckOutcome.Inconclusive
            is BarcodeLookup.Existing ->
                state(barcode, found.food.name, source = null, found.food.nutrition, targets)
            is BarcodeLookup.Candidate ->
                found.candidate.atwaterNutrition()
                    ?.let { state(barcode, found.candidate.name, found.candidate.source, it, targets) }
                    ?: CheckOutcome.Incomplete(found.candidate.name, found.candidate.source)
        }
    }

    private fun state(
        barcode: String,
        name: String,
        source: String?,
        nutrition: Nutrition,
        targets: IntakeTargets,
    ) = CheckOutcome.Stated(
        CheckedProduct(
            name = name,
            barcode = barcode,
            source = source,
            nutrition = nutrition,
            check = Check.of(
                nutrition,
                calorieBudgetKcal = targets.calorieBudgetKcal,
                proteinFloorG = targets.proteinFloorG,
            ),
        ),
    )
}
