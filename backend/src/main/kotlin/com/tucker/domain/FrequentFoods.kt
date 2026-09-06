package com.tucker.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * How often one **Food** was logged in a window, and when it was last reached
 * for — the two facts a ranking of [FrequentFoods] is decided on.
 *
 * An **Estimated Entry** has no Food and so is counted by nothing here.
 */
data class FoodLogCount(
    val foodId: Long,
    val entryCount: Int,
    val lastLoggedOn: LocalDate,
)

/**
 * Frequent Foods (CONTEXT.md, ADR 0028): the Foods a User reaches for most,
 * ranked by how many **Entries** name them in the trailing 30 days, ties broken
 * by the most recently logged.
 *
 * Distinct from an [IntakeBreakdown], which ranks by the *calories* a Food
 * contributed: the two disagree constantly, and neither is wrong.
 */
object FrequentFoods {

    /** How wide a window Frequent Foods are ranked over, and the only width. */
    const val WINDOW_DAYS = 30

    /**
     * How many are offered. A fact about the grid that shows them rather than
     * about the domain — applied here because the client sorts nothing and so
     * cannot be what decides which ten (ADR 0002).
     */
    const val CAP = 10

    /**
     * Refuse any window but the trailing [WINDOW_DAYS] days, as [IntakeBreakdown.of]
     * refuses its own: the width is an invariant of this read, not a User's choice.
     * Public so a caller can check it *before* the query it bounds.
     */
    fun requireWindow(from: LocalDate, to: LocalDate) {
        require(ChronoUnit.DAYS.between(from, to) == WINDOW_DAYS - 1L) {
            "Frequent Foods are ranked over the trailing $WINDOW_DAYS days, was $from..$to"
        }
    }

    /**
     * Rank [logged] — one entry per Food counted over the window [from]..[to],
     * both bounds inclusive. Selecting and counting them is the repository's job.
     *
     * A count is refused rather than filtered when its Food was last logged outside
     * the window. That catches a Food logged *wholly* outside it, which is what a
     * mismatched window pair produces; it cannot catch one logged both inside and
     * out, since [FoodLogCount.lastLoggedOn] is a maximum.
     */
    fun rank(from: LocalDate, to: LocalDate, logged: List<FoodLogCount>): List<FoodLogCount> {
        requireWindow(from, to)
        // Written out rather than `in from..to`: the range form compiles to a
        // conditional no test can reach (see IntakeBreakdown.of).
        val outside = logged.filter { it.lastLoggedOn < from || it.lastLoggedOn > to }
        require(outside.isEmpty()) { "every count must have been logged in $from..$to" }
        return logged.sortedWith(
            compareByDescending<FoodLogCount> { it.entryCount }
                .thenByDescending { it.lastLoggedOn }
                // A third key so the order is total. Two published keys leave the
                // commonest shape — a rotation logged as often as each other, all
                // last logged today — a full tie, and it is the *cap* that makes
                // that matter: something has to be dropped, and without this the
                // database's emission order decides which. The id means nothing
                // beyond being stable, so the same request answers the same way.
                .thenBy { it.foodId },
        ).take(CAP)
    }
}
