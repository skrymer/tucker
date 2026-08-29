package com.tucker.api

import com.tucker.domain.BarcodeLookup
import com.tucker.domain.Food
import com.tucker.domain.FoodCandidate
import com.tucker.domain.FoodKind
import com.tucker.domain.Nutrition
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.RecipeRepository
import com.tucker.persistence.ReferenceFoodRepository
import com.tucker.service.BarcodeLookupService
import com.tucker.service.FoodService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/** API representation of a Food (nutrition flattened for the wire). */
data class FoodResponse(
    val id: Long,
    val name: String,
    /** The domain enum, so the spec lists the values (see [EntryResponse.kind]). */
    val kind: FoodKind,
    val barcode: String?,
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    val cookedWeightG: Double?,
    /**
     * How many ingredient lines a Recipe is composed of — the catalog's
     * "N ingredients" subline. Always `null` for a plain Food (`kind = FOOD`).
     */
    val ingredientCount: Int?,
    /**
     * The **Reference Food** this Food borrows its micronutrients from, and its
     * name — both null while it is unmatched. The name rides along because the
     * catalog names what a Food is matched *to*: a bare tick is unverifiable, so
     * there would be nothing for a User to check the claim against (ADR 0027).
     */
    val referenceFoodId: Long?,
    val referenceFoodName: String?,
)

/**
 * Request to create a plain, manually-entered Food.
 *
 * The user supplies the three macros; the backend derives `caloriesPer100g`
 * via the Atwater factors (`4 × protein + 4 × carbs + 9 × fat`). See
 * `Nutrition.fromMacros` and CONTEXT.md.
 */
data class CreateFoodRequest(
    val name: String,
    val barcode: String?,
    val proteinPer100g: Double,
    val carbsPer100g: Double,
    val fatPer100g: Double,
)

/**
 * A [FoodCandidate] on the wire (ADR 0006): normalised per-100g macros with
 * absent ones left `null`, the Provider's stated energy as a cross-check, the
 * source for attribution, and the barcode. No calories — they are Atwater-derived
 * when the user confirms the Food via `POST /api/foods`.
 */
data class FoodCandidateResponse(
    val name: String,
    val barcode: String,
    val proteinPer100g: Double?,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    val statedEnergyKcalPer100g: Double?,
    val source: String,
)

/**
 * Which arm of a barcode lookup came back — the value the client branches on.
 *
 * A wire type rather than a domain one: the domain models this as the sealed
 * [BarcodeLookup], whose other two arms ([BarcodeLookup.Missing],
 * [BarcodeLookup.Inconclusive]) are statuses, not bodies (404 and 503, ADR 0006).
 * Only the two that carry a payload reach a response.
 */
enum class BarcodeLookupOutcome { EXISTING, CANDIDATE }

/**
 * The discriminated result of a barcode lookup: [outcome] says which of [food] and
 * [candidate] is set, and the other is null.
 */
data class BarcodeLookupResponse(
    val outcome: BarcodeLookupOutcome,
    val food: FoodResponse?,
    val candidate: FoodCandidateResponse?,
)

internal fun FoodCandidate.toResponse() = FoodCandidateResponse(
    name = name,
    barcode = barcode,
    proteinPer100g = proteinPer100g,
    carbsPer100g = carbsPer100g,
    fatPer100g = fatPer100g,
    statedEnergyKcalPer100g = statedEnergyKcalPer100g,
    source = source,
)

internal fun Food.toResponse(
    ingredientCount: Int? = null,
    referenceFoodName: String? = null,
) = FoodResponse(
    id = persistedId(id),
    name = name,
    kind = kind,
    barcode = barcode,
    caloriesPer100g = nutrition.caloriesPer100g,
    proteinPer100g = nutrition.proteinPer100g,
    carbsPer100g = nutrition.carbsPer100g,
    fatPer100g = nutrition.fatPer100g,
    cookedWeightG = cookedWeightG,
    ingredientCount = ingredientCount,
    referenceFoodId = referenceFoodId,
    referenceFoodName = referenceFoodName,
)

/** Which **Reference Food** a Food should borrow its micronutrients from. */
data class MatchReferenceFoodRequest(val referenceFoodId: Long)

@RestController
@RequestMapping("/api/foods")
class FoodController(
    private val foods: FoodRepository,
    private val recipes: RecipeRepository,
    private val foodService: FoodService,
    private val barcodeLookup: BarcodeLookupService,
    private val referenceFoods: ReferenceFoodRepository,
) {

    @GetMapping
    fun list(): List<FoodResponse> {
        val all = foods.findAll()
        val counts = recipes.ingredientCounts(all.filter { it.kind == FoodKind.RECIPE }.mapNotNull { it.id })
        val matched = referenceFoods.namesOf(all.mapNotNull { it.referenceFoodId }.distinct())
        return all.map {
            it.toResponse(
                ingredientCount = counts[it.id],
                referenceFoodName = matched[it.referenceFoodId],
            )
        }
    }

    @GetMapping("/{id}")
    fun byId(@PathVariable id: Long): FoodResponse {
        val food = foods.findById(id) ?: throw NotFoundException("no Food with id $id")
        val count = if (food.kind == FoodKind.RECIPE) {
            recipes.ingredientCounts(listOfNotNull(food.id))[food.id]
        } else {
            null
        }
        return food.toResponse(ingredientCount = count, referenceFoodName = matchedName(food))
    }

    /**
     * Match [id] to a **Reference Food**, so it borrows that food's micronutrients
     * (ADR 0027). A claim a User makes, never one Tucker infers — nothing is matched
     * silently, because a wrong match reports confident figures for food that was
     * never eaten.
     */
    @PutMapping("/{id}/reference-food")
    fun match(@PathVariable id: Long, @RequestBody request: MatchReferenceFoodRequest): FoodResponse {
        val food = foods.findById(id) ?: throw NotFoundException("no Food with id $id")
        // Resolved before the write rather than left to the foreign key, which would
        // surface an unknown id as a 500 rather than as the plain 404 it is.
        val reference = referenceFoods.findById(request.referenceFoodId)
            ?: throw NotFoundException("no Reference Food with id ${request.referenceFoodId}")
        val matched = food.copy(referenceFoodId = reference.id)
        foods.update(matched)
        return matched.toResponse(referenceFoodName = reference.name)
    }

    /**
     * Take back [id]'s borrow, leaving it contributing no micronutrients again.
     *
     * A match is reversible for the reason it is confirmed in the first place: a
     * wrong one is worse than none (ADR 0027). Idempotent, like every other delete
     * here — unmatching a Food that is already unmatched changes nothing.
     */
    @DeleteMapping("/{id}/reference-food")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun unmatch(@PathVariable id: Long) {
        val food = foods.findById(id) ?: return
        foods.update(food.copy(referenceFoodId = null))
    }

    /** What [food] is matched to, as a User would recognise it, or null if nothing. */
    private fun matchedName(food: Food): String? =
        food.referenceFoodId?.let { referenceFoods.findById(it)?.name }

    /**
     * Resolve a barcode catalog-first, then through the operator-configured
     * Provider chain (ADR 0006): `200 EXISTING` (a saved Food), `200 CANDIDATE`
     * (provider-sourced nutrition to review), or `404` on a total miss.
     */
    @GetMapping("/barcode/{barcode}")
    fun byBarcode(@PathVariable barcode: String): BarcodeLookupResponse =
        when (val result = barcodeLookup.lookup(barcode)) {
            is BarcodeLookup.Existing -> BarcodeLookupResponse(
                BarcodeLookupOutcome.EXISTING,
                food = result.food.toResponse(referenceFoodName = matchedName(result.food)),
                candidate = null,
            )
            is BarcodeLookup.Candidate -> BarcodeLookupResponse(
                BarcodeLookupOutcome.CANDIDATE,
                food = null,
                candidate = result.candidate.toResponse(),
            )
            BarcodeLookup.Missing -> throw barcodeNotFound(barcode)
            BarcodeLookup.Inconclusive -> throw providersUnreachable(barcode)
        }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@RequestBody request: CreateFoodRequest): FoodResponse {
        val food = Food.plain(
            id = null,
            name = request.name,
            barcode = request.barcode,
            nutrition = Nutrition.fromMacros(
                proteinPer100g = request.proteinPer100g,
                carbsPer100g = request.carbsPer100g,
                fatPer100g = request.fatPer100g,
            ),
        )
        return foods.insert(food).toResponse()
    }

    /**
     * Remove a Food from the catalog. A Food referenced by at least one Entry
     * cannot be deleted (CONTEXT.md, Food); [FoodService] enforces that rule and
     * surfaces a 400 naming the Food.
     */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(@PathVariable id: Long) = foodService.delete(id)
}
