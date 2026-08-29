package com.tucker.api

import com.tucker.domain.IntakeBreakdown
import com.tucker.domain.MicronutrientIntake
import com.tucker.domain.UnmatchedFood
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/** One row of the match queue: a Food borrowing nothing yet, and what it cost. */
data class UnmatchedFoodResponse(
    val foodId: Long,
    val name: String,
    val calories: Double,
    /** The Food's calories over [MicronutrientIntakeResponse.totalCalories], 0–1. */
    val share: Double,
)

/**
 * A **Micronutrient Intake** on the wire, in its slice-1 shape (ADR 0027): how much
 * of the window could contribute a figure, and what is left to match. The figures
 * themselves are issue #279.
 *
 * [coverage] is stated always and never scaled up — the unaccounted share is
 * disproportionately restaurant and packaged food, so filling it in would read as a
 * neutral estimate and be a biased one. [totalCalories] is what tells a fully
 * matched week from one where nothing was logged; both are an empty queue.
 */
data class MicronutrientIntakeResponse(
    val from: LocalDate,
    val to: LocalDate,
    val totalCalories: Double,
    val coverage: Double,
    val unmatched: List<UnmatchedFoodResponse>,
)

private fun UnmatchedFood.toResponse() =
    UnmatchedFoodResponse(foodId = foodId, name = name, calories = calories, share = share)

private fun MicronutrientIntake.toResponse() = MicronutrientIntakeResponse(
    from = from,
    to = to,
    totalCalories = totalCalories,
    coverage = coverage,
    unmatched = unmatched.map { it.toResponse() },
)

@RestController
@RequestMapping("/api/micronutrient-intake")
class MicronutrientIntakeController(
    private val entries: EntryRepository,
    private val foods: FoodRepository,
) {

    /**
     * The window [from]..[to], both bounds inclusive. The client owns the window
     * (ADR 0014) — it is the only thing that knows the User's local day.
     *
     * Read-only transactional for [IntakeBreakdownController]'s reason: the Foods
     * must describe the Entries that ate them, and holding one connection across
     * both reads is what stops a Food deleted in the gap leaving an Entry nothing
     * can name.
     */
    @Transactional(readOnly = true)
    @GetMapping
    fun intake(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ): MicronutrientIntakeResponse {
        val logged = entries.findBetween(from, to)
        val eaten = foods.foodsOf(logged)
        val breakdown = IntakeBreakdown.of(from, to, logged, eaten.mapValues { it.value.name })
        return MicronutrientIntake.of(breakdown, eaten).toResponse()
    }
}
