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
    val id: Long?
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
    override val id: Long?,
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
        /** Log [grams] of [food] on [date], computing the calories and protein. */
        fun log(date: LocalDate, food: Food, grams: Double): WeighedEntry {
            require(food.id != null) { "food must be persisted before it can be logged" }
            return WeighedEntry(
                id = null,
                loggedOn = date,
                foodId = food.id,
                grams = grams,
                calories = food.caloriesFor(grams),
                protein = food.proteinFor(grams),
            )
        }
    }
}

/**
 * An estimated Entry: a meal that could not be weighed (restaurant, on the go).
 * It carries a typed-in calorie figure; protein may be unknown.
 */
data class EstimatedEntry(
    override val id: Long?,
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
}
