package com.tucker.api

import com.tucker.domain.AlcoholByVolume
import com.tucker.domain.BarcodeLookup
import com.tucker.domain.Food
import com.tucker.domain.FoodCandidate
import com.tucker.domain.FoodKind
import com.tucker.domain.Macros
import com.tucker.domain.Recipe
import com.tucker.domain.Tag
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.RecipeRepository
import com.tucker.service.BarcodeLookupService
import com.tucker.service.FoodService
import org.springframework.format.annotation.DateTimeFormat
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.time.LocalDate

/** API representation of a Food (nutrition flattened for the wire). */
data class FoodResponse(
    val id: Long,
    val name: String,
    /** An enum rather than a String, so the spec lists the values (see [EntryResponse.kind]). */
    val kind: Kind,
    val barcode: String?,
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    /** Dietary fibre per 100 g, or null where it is not stated — which is not zero (ADR 0040). */
    val fibrePer100g: Double?,
    /** Alcohol in grams per 100 g, or null where it is not stated (ADR 0040). */
    val alcoholPer100g: Double?,
    /** The same alcohol as the ABV it is written and read as; null exactly when [alcoholPer100g] is. */
    val alcoholAbv: Double?,
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
    /** The **Tags** this Food carries, alphabetically ignoring case; empty, never null. */
    val tags: List<FoodTagResponse>,
) {
    /** A [FoodKind] as the wire names it. */
    enum class Kind { FOOD, RECIPE }
}

/** A Tag as a Food carries it: enough to draw a chip and to send the id back. */
data class FoodTagResponse(val id: Long, val name: String)

/**
 * The figures a request supplies for a plain Food, fibre and alcohol optional. Alcohol
 * arrives as the ABV a User reads off the bottle and is kept as grams (ADR 0040).
 */
interface MacroFigures {
    val proteinPer100g: Double
    val carbsPer100g: Double
    val fatPer100g: Double
    val fibrePer100g: Double?
    val alcoholAbv: Double?

    fun macros() = Macros(
        proteinPer100g = proteinPer100g,
        carbsPer100g = carbsPer100g,
        fatPer100g = fatPer100g,
        fibrePer100g = fibrePer100g,
        alcoholPer100g = alcoholAbv?.let { AlcoholByVolume(it).gramsPer100g },
    )
}

/**
 * Request to create a plain, manually-entered Food.
 *
 * The user supplies the macros, fibre and alcohol optionally; the backend derives
 * `caloriesPer100g` by the FSANZ factors (ADR 0040). See `Macros.nutrition` and CONTEXT.md.
 */
data class CreateFoodRequest(
    val name: String,
    val barcode: String?,
    override val proteinPer100g: Double,
    override val carbsPer100g: Double,
    override val fatPer100g: Double,
    override val fibrePer100g: Double?,
    override val alcoholAbv: Double?,
    val tagIds: List<Long>,
) : MacroFigures

// Two wire bodies that share fields on purpose: nesting one in the other would move the wire.
/* jscpd:ignore-start */
/**
 * Request to correct a plain Food (ADR 0037): the same macros as [CreateFoodRequest],
 * calories derived from them. No barcode — it comes from the scanner, never a correction.
 */
data class CorrectFoodRequest(
    val name: String,
    override val proteinPer100g: Double,
    override val carbsPer100g: Double,
    override val fatPer100g: Double,
    override val fibrePer100g: Double?,
    override val alcoholAbv: Double?,
    val tagIds: List<Long>,
) : MacroFigures
/* jscpd:ignore-end */

/**
 * A [FoodCandidate] on the wire (ADR 0006): normalised per-100g macros with
 * absent ones left `null`, the Provider's stated energy as a cross-check, the
 * source for attribution, and the barcode. No calories — they are derived by the
 * FSANZ factors (ADR 0040) when the user confirms the Food via `POST /api/foods`.
 */
// The wire mirror of the domain FoodCandidate on purpose: the domain stays free of the wire.
/* jscpd:ignore-start */
data class FoodCandidateResponse(
    val name: String,
    val barcode: String,
    val proteinPer100g: Double?,
    val carbsPer100g: Double?,
    val fatPer100g: Double?,
    val statedEnergyKcalPer100g: Double?,
    val source: String,
    /** The Provider's fibre where the stated energy vouches for it; null otherwise (not stated). */
    val fibrePer100g: Double?,
    val alcoholPer100g: Double?,
    /** The same alcohol as the ABV the form prefills; null exactly when [alcoholPer100g] is. */
    val alcoholAbv: Double?,
    /** The Provider's carbs, set only when fibre folded into them was taken out of [carbsPer100g]. */
    val providerCarbsPer100g: Double?,
    /** [carbsPer100g] without the folded-in fibre; null exactly when [providerCarbsPer100g] is. */
    val adjustedCarbsPer100g: Double?,
)
/* jscpd:ignore-end */

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
    carbsPer100g = offeredCarbsPer100g,
    fatPer100g = fatPer100g,
    statedEnergyKcalPer100g = statedEnergyKcalPer100g,
    source = source,
    fibrePer100g = offeredFibrePer100g,
    alcoholPer100g = alcoholPer100g,
    alcoholAbv = alcoholPer100g?.let(AlcoholByVolume::percentOf),
    providerCarbsPer100g = carbsPer100g.takeIf { adjustedCarbsPer100g != null },
    adjustedCarbsPer100g = adjustedCarbsPer100g,
)

private fun FoodKind.onTheWire() = when (this) {
    FoodKind.Plain -> FoodResponse.Kind.FOOD
    is FoodKind.Recipe -> FoodResponse.Kind.RECIPE
}

/**
 * This Food on the wire. [tags] is required rather than defaulted: a Food's Tags live
 * in another table, so a caller that forgot them would report a tagged Food as untagged.
 */
internal fun Food.toResponse(
    tags: List<Tag>,
    ingredientCount: Int? = null,
    referenceFoodName: String? = null,
) = FoodResponse(
    id = id,
    name = name,
    kind = kind.onTheWire(),
    barcode = barcode,
    caloriesPer100g = nutrition.caloriesPer100g,
    proteinPer100g = nutrition.proteinPer100g,
    carbsPer100g = nutrition.carbsPer100g,
    fatPer100g = nutrition.fatPer100g,
    fibrePer100g = nutrition.fibrePer100g,
    alcoholPer100g = nutrition.alcoholPer100g,
    alcoholAbv = nutrition.alcoholPer100g?.let(AlcoholByVolume::percentOf),
    cookedWeightG = (kind as? FoodKind.Recipe)?.cookedWeightG,
    ingredientCount = ingredientCount,
    referenceFoodId = referenceFoodId,
    referenceFoodName = referenceFoodName,
    tags = tags.sortedBy { it.name }.map { FoodTagResponse(it.id, it.name.value) },
)

/**
 * One ingredient line of a [RecipeCompositionResponse]: the grams weighed in and the
 * ingredient's per-100 g figures, which is all a Recipe's roll-up reads.
 */
data class CompositionLineResponse(
    val foodId: Long,
    val grams: Double,
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
)

/**
 * A Recipe a correction of a Food reaches: its figures as stored, and its lines with
 * their figures, so the client can preview before → after on unsaved input (ADR 0037).
 * Not [RecipeResponse], which names each line for the Recipe's own view and carries
 * no figures.
 */
data class RecipeCompositionResponse(
    val id: Long,
    val name: String,
    val caloriesPer100g: Double,
    val proteinPer100g: Double,
    val cookedWeightG: Double,
    val ingredients: List<CompositionLineResponse>,
)

private fun Recipe.toCompositionResponse(stored: Food) = RecipeCompositionResponse(
    id = id,
    name = name,
    caloriesPer100g = stored.nutrition.caloriesPer100g,
    proteinPer100g = stored.nutrition.proteinPer100g,
    cookedWeightG = cookedWeightG,
    ingredients = ingredients.map { line ->
        CompositionLineResponse(
            foodId = line.ingredient.id,
            grams = line.grams,
            caloriesPer100g = line.ingredient.nutrition.caloriesPer100g,
            proteinPer100g = line.ingredient.nutrition.proteinPer100g,
        )
    },
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
    private val describer: FoodDescriber,
) {

    @GetMapping
    fun list(): List<FoodResponse> = describer.describe(foods.findAll())

    /**
     * The caller's **Frequent Foods** over the window [from]..[to], both bounds
     * inclusive. The client owns the window (ADR 0014) and sorts nothing.
     *
     * Read-only transactional around the description too, so the counts and what the
     * tiles say about the Foods they name are one instant.
     */
    @Transactional(readOnly = true)
    @GetMapping("/frequent")
    fun frequent(
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) from: LocalDate,
        @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) to: LocalDate,
    ): List<FoodResponse> = describer.describe(foodService.frequent(from, to))

    @GetMapping("/{id}")
    fun byId(@PathVariable id: Long): FoodResponse {
        val food = foods.findById(id) ?: throw NotFoundException("no Food with id $id")
        return describer.describe(food)
    }

    /** The caller's Recipes using the Food [id], alphabetically: what a correction of it reaches. */
    @Transactional(readOnly = true)
    @GetMapping("/{id}/recipes")
    fun recipesUsing(@PathVariable id: Long): List<RecipeCompositionResponse> {
        if (!foods.exists(id)) throw NotFoundException("no Food with id $id")
        return recipes.recipesUsing(id).map { (stored, recipe) -> recipe.toCompositionResponse(stored) }
    }

    /** Match [id] to a **Reference Food**, so it borrows that food's micronutrients. */
    @PutMapping("/{id}/reference-food")
    fun match(@PathVariable id: Long, @RequestBody request: MatchReferenceFoodRequest): FoodResponse =
        describer.describe(foodService.match(id, request.referenceFoodId))

    /** Take back [id]'s borrow, leaving it contributing no micronutrients again. */
    @DeleteMapping("/{id}/reference-food")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun unmatch(@PathVariable id: Long) = foodService.unmatch(id)

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
                food = describer.describe(result.food),
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
    @Transactional
    fun create(@RequestBody request: CreateFoodRequest): FoodResponse {
        val food = Food.plain(
            id = foods.nextId(),
            name = request.name,
            barcode = request.barcode,
            nutrition = request.macros().nutrition(),
        ).retagged(request.tagIds)
        val created = foodService.create(food) ?: throw NotFoundException("no Tag among ${request.tagIds}")
        return describer.describe(created)
    }

    /** Correct a plain Food's name, macros and Tags (ADR 0037). The barcode is not correctable. */
    @PutMapping("/{id}")
    fun correct(@PathVariable id: Long, @RequestBody request: CorrectFoodRequest): FoodResponse {
        val corrected = foodService.correct(
            id,
            request.name,
            request.macros(),
            request.tagIds,
        ) ?: throw NotFoundException("no Food with id $id, or no Tag among ${request.tagIds}")
        return describer.describe(corrected)
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
