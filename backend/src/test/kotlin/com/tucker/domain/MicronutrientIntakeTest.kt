package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * The **Micronutrient Intake** read: a lower-bound daily average per nutrient, what
 * Tucker can claim from it, how much of the window could contribute at all, and what
 * is left to match (ADR 0027).
 *
 * The queue is the **Intake Breakdown** filtered to the unmatched, so it shares that
 * ranking and that denominator rather than inventing a second pair.
 */
class MicronutrientIntakeTest {

    private val day = LocalDate.of(2026, 8, 27)
    private val weekStart = day.minusDays(6)

    @Test
    fun `a window shorter than the trailing seven days is refused`() {
        val chicken = food(id = 1, name = "Chicken breast")
        val entries = listOf(WeighedEntry.log(day, chicken, grams = 200.0))
        val refused = assertFailsWith<IllegalArgumentException> {
            MicronutrientIntake.of(day, day, entries, joined(mapOf(1L to chicken), emptyMap()), emptyMap())
        }

        assertEquals(
            "a Micronutrient Intake is read over the trailing 7 days, was 2026-08-27..2026-08-27",
            refused.message,
            "micronutrient intake is enormously spiky day to day, so a shorter window is " +
                "noise wearing a number's clothes (CONTEXT.md) — refused here rather than " +
                "left to one client call site to remember",
        )
    }

    @Test
    fun `a matched Food supplies its Reference Food's nutrients, by grams, as a day's average`() {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        val entries = listOf(WeighedEntry.log(day, chicken, grams = 700.0))

        val read = intake(entries, mapOf(1L to chicken), cheddarLikeIron(1.0))

        assertEquals(
            1.0,
            read.rows.single { it.nutrient == Micronutrient.IRON }.amount,
            "700 g of a food reporting 1 mg per 100 g is 7 mg over the window, and a " +
                "Reference Intake is a daily figure — so a week's total read against it " +
                "would clear almost everything at once (CONTEXT.md)",
        )
    }

    @Test
    fun `a bound over its limit is stated at any coverage`() {
        val overLimit = IntakeLimit(amount = 45.0, kind = IntakeLimitKind.UPPER_LEVEL)
        val read = weekOf(grams = 70.0, iron = 500.0, reference = ReferenceIntake(8.0, overLimit))

        assertEquals(
            MicronutrientClaim.OVER_LIMIT,
            read.rows.single { it.nutrient == Micronutrient.IRON }.claim,
            "one matched food in an otherwise unread week still puts 50 mg a day past a " +
                "45 mg line — more data can only push it further over, which is why this " +
                "is the one claim that holds on a barely-matched week (ADR 0027)",
        )
    }

    @Test
    fun `a bound sitting exactly on its limit has not crossed it`() {
        val limit = IntakeLimit(amount = 45.0, kind = IntakeLimitKind.UPPER_LEVEL)
        // 700 g of a food reporting 45 mg per 100 g is 45 mg a day exactly.
        val read = weekOf(grams = 700.0, iron = 45.0, reference = ReferenceIntake(8.0, limit))

        assertEquals(
            MicronutrientClaim.CLEARS_REFERENCE,
            read.rows.single { it.nutrient == Micronutrient.IRON }.claim,
            "*over* means over: an Upper Level is where risk begins to rise, so a bound " +
                "sitting exactly on the line has not crossed it and the one claim Tucker " +
                "makes at any coverage is not yet earned (ADR 0027)",
        )
    }

    @Test
    fun `a body with no published figures is told apart from a window with no matches`() {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        val entries = listOf(WeighedEntry.log(day, chicken, grams = 700.0))

        val noBody = intake(entries, mapOf(1L to chicken), cheddarLikeIron(1.0))
        val body = intake(
            entries,
            mapOf(1L to chicken),
            cheddarLikeIron(1.0),
            mapOf(Micronutrient.IRON to ReferenceIntake(8.0, null)),
        )

        assertEquals(
            false,
            noBody.hasReferenceIntakes,
            "with no Profile there is nothing to read the window against, so every " +
                "nutrient falls to NOT_ENOUGH_MATCHED however much was matched — the two " +
                "earn opposite advice, and only this tells them apart (ADR 0027)",
        )
        assertEquals(true, body.hasReferenceIntakes, "and a body that resolves a band has")
    }

    @Test
    fun `a body the published bands do not reach has no lines, whatever it ate`() {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        val entries = listOf(WeighedEntry.log(day, chicken, grams = 700.0))

        // A Profile that resolved to nothing — the bands open at 14, so a body below
        // that has no published line, which is not the same as having no body.
        val read = intake(entries, mapOf(1L to chicken), cheddarLikeIron(1.0), references = emptyMap())

        assertEquals(
            false,
            read.hasReferenceIntakes,
            "nothing resolved, so no nutrient can earn a claim however much was matched " +
                "— and telling this User to match more food is advice no amount of " +
                "matching can satisfy, which is the whole reason the flag exists (ADR 0027)",
        )
    }

    @Test
    fun `a window states how many of its days were logged`() {
        val chicken = food(id = 1, name = "Chicken breast")
        val entries = listOf(
            WeighedEntry.log(day, chicken, grams = 100.0),
            WeighedEntry.log(day.minusDays(1), chicken, grams = 100.0),
            // Same day as the first, so it adds a meal and not a day.
            WeighedEntry.log(day, chicken, grams = 50.0),
        )

        val read = intake(entries, mapOf(1L to chicken))

        assertEquals(
            2,
            read.loggedDays,
            "the width of a window is no evidence it was lived in, so a seven-day claim " +
                "carries the count of days that hold an Entry — two here, not three " +
                "Entries and not seven days (ADR 0026)",
        )
    }

    @Test
    fun `a bound that reaches its reference clears it`() {
        val read = weekOf(grams = 700.0, iron = 8.0, reference = ReferenceIntake(8.0, null))

        assertEquals(
            MicronutrientClaim.CLEARS_REFERENCE,
            read.rows.single { it.nutrient == Micronutrient.IRON }.claim,
            "reaching the published figure is sound exactly when the bound already has: " +
                "whatever went unmatched can only add to it (ADR 0027)",
        )
    }

    @Test
    fun `a bound below its reference says nothing, and is never a shortfall`() {
        val read = weekOf(grams = 700.0, iron = 1.0, reference = ReferenceIntake(8.0, null))

        assertEquals(
            MicronutrientClaim.NOT_ENOUGH_MATCHED,
            read.rows.single { it.nutrient == Micronutrient.IRON }.claim,
            "1 mg a day against a published 8 mg is not a deficiency and not a deficit: " +
                "the share that went unmatched could easily hold the other seven (ADR 0027)",
        )
    }

    @Test
    fun `the unmatched share is never scaled up to fill the gap`() {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        val references = cheddarLikeIron(1.0)
        val eaten = listOf(WeighedEntry.log(day, chicken, grams = 700.0))
        val takeaway = EstimatedEntry(
            id = null,
            loggedOn = day,
            label = "Thai",
            calories = eaten.single().calories,
            protein = null,
        )

        val alone = intake(eaten, mapOf(1L to chicken), references)
        val diluted = intake(eaten + takeaway, mapOf(1L to chicken), references)

        assertEquals(
            alone.rows,
            diluted.rows,
            "the second window is half unaccounted for and its figures are " +
                "identical: extrapolating the known portion to fill the gap reads as a " +
                "neutral estimate and is a biased one (ADR 0027)",
        )
        assertEquals(
            0.5,
            diluted.coverage,
            "only the share it could speak for moves — that is the honest thing to change",
        )
    }

    @Test
    fun `an unmatched Food is queued with its share of the window`() {
        val chicken = food(id = 1, name = "Chicken breast")
        val entries = listOf(WeighedEntry.log(day, chicken, grams = 200.0))

        val read = intake(entries, mapOf(1L to chicken))

        assertEquals(
            listOf(UnmatchedFood(foodId = 1, name = "Chicken breast", share = 1.0)),
            read.unmatched,
            "there is one Food, it is all of the window's calories, and nothing is borrowed " +
                "from it yet — so it is the whole queue",
        )
    }

    @Test
    fun `a window with nothing logged says so, rather than looking fully covered`() {
        val read = intake(entries = emptyList(), foods = emptyMap())

        assertEquals(
            0.0,
            read.totalCalories,
            "an empty queue and zero coverage read identically to a week where everything " +
                "is matched, so the window's own total is what tells them apart",
        )
        assertEquals(
            0.0,
            read.coverage,
            "and coverage is zero rather than NaN: nothing over nothing is what dividing " +
                "by the window's own total would give, and NaN serialises as null",
        )
    }

    @Test
    fun `a Recipe is never queued, because it is never matched`() {
        val bolognese = recipe(id = 3, name = "Bolognese")
        val entries = listOf(WeighedEntry.log(day, bolognese, grams = 300.0))

        val read = intake(entries, mapOf(3L to bolognese))

        assertEquals(
            emptyList(),
            read.unmatched,
            "a Recipe rolls its micronutrients up from whichever ingredients are matched " +
                "(CONTEXT.md), so offering it as something to match would be an unusable tap",
        )
        assertEquals(
            0.0,
            read.coverage,
            "and it contributes nothing to coverage either, until a later slice makes it " +
                "count fractionally, by how much of it came from matched ingredients",
        )
    }

    @Test
    fun `an Estimated Entry contributes nothing and is not something to match`() {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        val entries = listOf(
            WeighedEntry.log(day, chicken, grams = 200.0),
            EstimatedEntry(id = null, loggedOn = day, label = "Work canteen", calories = 312.8, protein = null),
        )

        val read = intake(entries, mapOf(1L to chicken), aBorrow)

        assertEquals(
            0.5,
            read.coverage,
            "an Estimated Entry has no Food, so nothing can ever be borrowed for it — half " +
                "this window is unaccounted for permanently, not pending a tap",
        )
        assertEquals(
            emptyList(),
            read.unmatched,
            "and it is not queued: a queue is a list of things to do, and there is nothing " +
                "to do about a meal that was never weighed",
        )
    }

    @Test
    fun `coverage is the share of the window's calories that could contribute at all`() {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        val rice = food(id = 2, name = "Jasmine rice")
        val entries = listOf(
            WeighedEntry.log(day, chicken, grams = 200.0),
            WeighedEntry.log(day, rice, grams = 200.0),
        )

        val read = intake(entries, mapOf(1L to chicken, 2L to rice), aBorrow)

        assertEquals(
            0.5,
            read.coverage,
            "half the window came from a Food with a Reference Food behind it, so half of " +
                "it can supply a figure and the other half is honestly unaccounted for",
        )
    }

    /** A week whose only food is [grams] of one matched Food reporting [iron] mg per 100 g. */
    private fun weekOf(grams: Double, iron: Double, reference: ReferenceIntake): MicronutrientIntake {
        val chicken = food(id = 1, name = "Chicken breast", referenceFoodId = 42)
        return intake(
            listOf(WeighedEntry.log(day, chicken, grams = grams)),
            mapOf(1L to chicken),
            cheddarLikeIron(iron),
            mapOf(Micronutrient.IRON to reference),
        )
    }

    @Test
    fun `coverage is measured in calories, not in grams`() {
        val lettuce = food(
            id = 1,
            name = "Lettuce",
            referenceFoodId = 42,
            nutrition = Nutrition.fromMacros(proteinPer100g = 0.0, carbsPer100g = 2.5, fatPer100g = 0.0),
        )
        val oil = food(
            id = 2,
            name = "Olive oil",
            nutrition = Nutrition.fromMacros(proteinPer100g = 0.0, carbsPer100g = 0.0, fatPer100g = 100.0),
        )
        val entries = listOf(
            WeighedEntry.log(day, lettuce, grams = 1000.0),
            WeighedEntry.log(day, oil, grams = 100.0),
        )

        val read = intake(entries, mapOf(1L to lettuce, 2L to oil), aBorrow)

        assertEquals(
            0.1,
            read.coverage,
            "the matched food is 91% of the window by mass and a tenth of it by calories — " +
                "calories are the measure because an Estimated Entry has no mass at all, so " +
                "grams cannot weigh the entries most likely to be missing (ADR 0026)",
        )
    }

    private fun food(
        id: Long,
        name: String,
        referenceFoodId: Long? = null,
        nutrition: Nutrition = Nutrition.fromMacros(proteinPer100g = 31.0, carbsPer100g = 0.0, fatPer100g = 3.6),
    ) = Food.plain(id = id, name = name, barcode = null, nutrition = nutrition)
        .copy(referenceFoodId = referenceFoodId)

    private fun recipe(id: Long, name: String) = Food(
        id = id,
        name = name,
        kind = FoodKind.RECIPE,
        barcode = null,
        nutrition = Nutrition.fromMacros(proteinPer100g = 8.0, carbsPer100g = 12.0, fatPer100g = 5.0),
        cookedWeightG = 900.0,
    )

    private fun intake(
        entries: List<Entry>,
        foods: Map<Long, Food>,
        referenceFoods: Map<Long, ReferenceFood> = emptyMap(),
        // Null, not an empty map: absent means there was no body to resolve lines
        // for, which is the state `hasReferenceIntakes` exists to tell apart.
        references: Map<Micronutrient, ReferenceIntake>? = null,
    ) = MicronutrientIntake.of(weekStart, day, entries, joined(foods, referenceFoods), references)

    /** Something for a matched Food to point at where the figures are beside the point. */
    private val aBorrow = cheddarLikeIron(0.0)

    /** A Reference Food reporting [iron] mg per 100 g, keyed by the id Foods point at. */
    private fun cheddarLikeIron(iron: Double) =
        mapOf(42L to referenceFood("Chicken, breast", Micronutrient.IRON to iron, id = 42))

    /** The Foods a window ate, each joined to what it borrows — what `of` reads. */
    private fun joined(foods: Map<Long, Food>, referenceFoods: Map<Long, ReferenceFood>) =
        foods.mapValues { (_, food) -> BorrowedFood(food, referenceFoods[food.referenceFoodId]) }

}
