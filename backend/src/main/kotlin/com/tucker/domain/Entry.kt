package com.tucker.domain

import java.time.LocalDate

/** Persistence and transport discriminator for the [Entry] hierarchy. */
enum class EntryKind { WEIGHED, ESTIMATED }

/**
 * One eating occasion. Either a precise [WeighedEntry] or an [EstimatedEntry].
 * Calories and protein are snapshotted at log time — an Entry is a historical
 * fact and does not change if its Food is later edited.
 */
sealed interface Entry {
    val id: Long
    val loggedOn: LocalDate
    val calories: Double
    val protein: Double?

    /** Whether this Entry's figures are an estimate rather than weighed. */
    val isEstimate: Boolean
}

/**
 * A precise Entry: a Food weighed in grams. Calories and protein are computed
 * from the Food at the moment of logging — see [log].
 */
data class WeighedEntry(
    override val id: Long,
    override val loggedOn: LocalDate,
    val foodId: Long,
    val grams: Double,
    override val calories: Double,
    override val protein: Double,
) : Entry {

    override val isEstimate: Boolean get() = false

    init {
        require(grams > 0) { "grams must be > 0, was $grams" }
        require(calories >= 0) { "calories must be >= 0" }
        require(protein >= 0) { "protein must be >= 0" }
    }

    companion object {
        /** Log [portion] on [date], computing the calories and protein. */
        fun log(id: Long, date: LocalDate, portion: WeighedPortion, today: LocalDate): WeighedEntry {
            requireNoLaterThanTomorrow(date, today)
            val (food, grams) = portion
            return WeighedEntry(
                id = id,
                loggedOn = date,
                foodId = food.id,
                grams = grams,
                calories = food.caloriesFor(grams),
                protein = food.proteinFor(grams),
            )
        }
    }
}

/** A Food and the grams of it that were weighed. */
data class WeighedPortion(
    val food: Food,
    val grams: Double,
)

/**
 * An estimated Entry: a meal that could not be weighed (restaurant, on the go).
 * It carries a typed-in calorie figure; protein may be unknown.
 */
data class EstimatedEntry(
    override val id: Long,
    override val loggedOn: LocalDate,
    val label: String,
    override val calories: Double,
    override val protein: Double?,
) : Entry {

    override val isEstimate: Boolean get() = true

    init {
        require(label.isNotBlank()) { "an estimated Entry needs a label" }
        require(calories >= 0) { "calories must be >= 0" }
        require(protein == null || protein >= 0) { "protein must be >= 0 when given" }
    }

    companion object {
        /** Log [estimate] on [date]. Refused when [date] is later than tomorrow. */
        fun log(id: Long, date: LocalDate, estimate: MealEstimate, today: LocalDate): EstimatedEntry {
            requireNoLaterThanTomorrow(date, today)
            return EstimatedEntry(id, date, estimate.label, estimate.calories, estimate.protein)
        }
    }
}

/** What a User types in for a meal they could not weigh: a name, its calories, and its protein if known. */
data class MealEstimate(
    val label: String,
    val calories: Double,
    val protein: Double?,
)

/** Tomorrow is the furthest ahead an Entry can be dated (ADR 0035). */
private fun requireNoLaterThanTomorrow(date: LocalDate, today: LocalDate) {
    require(!date.isAfter(today.plusDays(1))) {
        "an Entry can be dated no later than tomorrow (was $date, today is $today)"
    }
}
