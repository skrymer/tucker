package com.tucker.api

import com.tucker.domain.BorrowedFood
import com.tucker.domain.BorrowedIngredient
import com.tucker.domain.FoodKind
import com.tucker.domain.Micronutrient
import com.tucker.domain.MicronutrientClaim
import com.tucker.domain.MicronutrientIntake
import com.tucker.domain.MicronutrientRow
import com.tucker.domain.RecipeIngredient
import com.tucker.domain.ReferenceFood
import com.tucker.domain.ReferenceLine
import com.tucker.domain.UnmatchedFood
import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.NutrientReferenceValueRepository
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.RecipeRepository
import com.tucker.persistence.ReferenceFoodRepository
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
    /** The Food's calories over [MicronutrientIntakeResponse.totalCalories], 0–1. */
    val share: Double,
)

/** The published figure a claim was read against, and which one it is. */
data class PublishedLineResponse(
    val amount: Double,
    /** The domain enum, so the spec lists the values (see [FoodResponse.kind]). */
    val kind: ReferenceLine,
)

/**
 * One nutrient's window on the wire: a lower-bound daily average, the published
 * figure it was read against, and what that lets Tucker claim.
 *
 * **A row Tucker can make no claim about carries no figures**, only its name and
 * that fact. A shortfall is not published, so there is nothing here to draw one
 * from — the rule is a property of the response rather than a convention every
 * client has to keep, which is what ADR 0002 asks of a rule this load-bearing.
 *
 * [readAgainst] is the *one* figure the verdict stands on, never both of them
 * side by side: pairing a claim with its line is `claimFor`'s rule, and a response
 * that ships the pair unresolved leaves every client to restate it — and free to
 * pick the other one (ADR 0027, amended by #288).
 */
data class MicronutrientRowResponse(
    /** The domain enums, so the spec lists the values (see [FoodResponse.kind]). */
    val nutrient: Micronutrient,
    val label: String,
    val unit: String,
    val amount: Double?,
    val readAgainst: PublishedLineResponse?,
    val claim: MicronutrientClaim,
)

/**
 * A **Micronutrient Intake** on the wire (ADR 0027): what the window's matched food
 * supplied per nutrient, how much of it could supply anything at all, and what is
 * left to match. Nothing is stored per window — it is a read, like an Intake
 * Breakdown.
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
    /** Days of the window holding an Entry — how far the claim above can be trusted. */
    val loggedDays: Int,
    val coverage: Double?,
    /**
     * Whether any Reference Intake resolved for this body. False until the User
     * has a **Profile**, and then no nutrient can earn a claim however much of
     * the window was matched — which is advice about the Profile, not about
     * matching more food.
     */
    val hasReferenceIntakes: Boolean,
    val rows: List<MicronutrientRowResponse>,
    val unmatched: List<UnmatchedFoodResponse>,
)

/** One ingredient line joined to what its Food borrows, if anything. */
private fun RecipeIngredient.borrow(references: Map<Long, ReferenceFood>) =
    BorrowedIngredient(BorrowedFood(ingredient, references[ingredient.referenceFoodId]), grams)

private fun UnmatchedFood.toResponse() =
    UnmatchedFoodResponse(foodId = foodId, name = name, share = share)

private fun MicronutrientRow.toResponse() = MicronutrientRowResponse(
    nutrient = nutrient,
    // The label and the unit ride along per row rather than being a second copy of
    // the enum in the client: 0.4 µg of iodine and 490 mg of sodium are the same
    // number and nothing else, which is why the unit travels with the figure.
    label = nutrient.label,
    unit = nutrient.unit,
    amount = amount.takeIf { canBeStated },
    // Not guarded in turn: the domain leaves this null on exactly the rows that
    // earn no claim, so repeating the test here would be the second statement of
    // the rule this field exists to remove.
    readAgainst = readAgainst?.let { PublishedLineResponse(it.amount, it.kind) },
    claim = claim,
)

private val MicronutrientRow.canBeStated: Boolean
    get() = claim != MicronutrientClaim.NOT_ENOUGH_MATCHED

private fun MicronutrientIntake.toResponse() = MicronutrientIntakeResponse(
    from = from,
    to = to,
    totalCalories = totalCalories,
    loggedDays = loggedDays,
    coverage = coverage,
    hasReferenceIntakes = hasReferenceIntakes,
    rows = rows.map { it.toResponse() },
    unmatched = unmatched.map { it.toResponse() },
)

@RestController
@RequestMapping("/api/micronutrient-intake")
class MicronutrientIntakeController(
    private val entries: EntryRepository,
    private val foods: FoodRepository,
    private val recipes: RecipeRepository,
    private val referenceFoods: ReferenceFoodRepository,
    private val referenceValues: NutrientReferenceValueRepository,
    private val profiles: ProfileRepository,
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
        val catalog = foods.foodsOf(logged)
        // A Recipe is never matched — it rolls up from whichever of its ingredients
        // are (ADR 0027) — so its composition is read alongside the catalog, and its
        // ingredients' own borrows are resolved in the same pass as the catalog's.
        val compositions = recipes.ingredientsOf(catalog.filterValues { it.kind == FoodKind.RECIPE }.keys)
        val eatenFoods = catalog.values + compositions.values.flatten().map { it.ingredient }
        val borrowed = referenceFoods.findByIds(eatenFoods.mapNotNull { it.referenceFoodId }.toSet())
        val eaten = catalog.mapValues { (id, food) ->
            BorrowedFood(food, borrowed[food.referenceFoodId], compositions[id].orEmpty().map { it.borrow(borrowed) })
        }
        // Resolved once, at the window's END date, so a window spanning a birthday
        // has one answer rather than a different line per day (CONTEXT.md). A User
        // who has not set a Profile up has no body to read against, and every
        // nutrient then earns no claim rather than being read against a guess.
        val references = profiles.get()?.let { referenceValues.all().forBody(it, on = to) }
        return MicronutrientIntake.of(from, to, logged, eaten, references).toResponse()
    }
}
