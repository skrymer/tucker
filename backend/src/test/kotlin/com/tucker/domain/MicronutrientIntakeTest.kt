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
 * The window divides into what each Food contributed — a **Recipe** into the
 * ingredients that made it — so the figures, the coverage share and the queue read
 * one set of food. The denominator stays the **Intake Breakdown**'s, so a queue row
 * and a breakdown slice are shares of one thing.
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
    fun `a bound over its limit carries the limit it was read against, kind and all`() {
        fun lineOf(kind: IntakeLimitKind): PublishedLine? {
            val overLimit = IntakeLimit(amount = 45.0, kind = kind)
            val read = weekOf(grams = 70.0, iron = 500.0, reference = ReferenceIntake(8.0, overLimit))
            return read.rows.single { it.nutrient == Micronutrient.IRON }.readAgainst
        }

        assertEquals(
            PublishedLine(kind = ReferenceLine.UPPER_LEVEL, amount = 45.0),
            lineOf(IntakeLimitKind.UPPER_LEVEL),
            "the claim was decided *by* this line, so it comes back with it — a reader " +
                "handed both published figures has to re-run the rule to know which one " +
                "the verdict stands on, and would be free to pick the other (ADR 0002)",
        )
        assertEquals(
            PublishedLine(kind = ReferenceLine.SUGGESTED_DIETARY_TARGET, amount = 45.0),
            lineOf(IntakeLimitKind.SUGGESTED_DIETARY_TARGET),
            "and which kind of line survives the trip: sodium's is a population " +
                "chronic-disease target rather than where harm begins, so reporting it " +
                "as an Upper Level is the substitution ADR 0027 refuses",
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
    fun `a bound that clears its reference carries the recommended figure, not the limit`() {
        val farBelowItsLimit = IntakeLimit(amount = 45.0, kind = IntakeLimitKind.UPPER_LEVEL)
        val read = weekOf(grams = 700.0, iron = 8.0, reference = ReferenceIntake(8.0, farBelowItsLimit))

        assertEquals(
            PublishedLine(kind = ReferenceLine.RECOMMENDED, amount = 8.0),
            read.rows.single { it.nutrient == Micronutrient.IRON }.readAgainst,
            "both published figures are set on this nutrient and only one of them " +
                "decided the verdict — the row names it, so nothing downstream has to " +
                "know that this claim is the one reached by the recommended figure",
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
    fun `a bound below its reference was read against nothing, so it names nothing`() {
        val read = weekOf(grams = 700.0, iron = 1.0, reference = ReferenceIntake(8.0, null))

        assertEquals(
            null,
            read.rows.single { it.nutrient == Micronutrient.IRON }.readAgainst,
            "the published figure is set and the bound simply did not reach it, so no " +
                "line was crossed and none was cleared — naming one here would put a " +
                "figure beside a nutrient Tucker has declined to state (ADR 0027)",
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
            null,
            read.coverage,
            "and coverage is absent rather than zero: calories are its measure, so a " +
                "window that ate none divides nothing by nothing — 0% would report a " +
                "week Tucker could read perfectly well as unreadable (ADR 0027)",
        )
    }

    @Test
    fun `a Recipe supplies its ingredients' nutrients, re-expressed over the cooked weight`() {
        val mince = food(id = 1, name = "Beef mince", referenceFoodId = 42)
        val passata = food(id = 2, name = "Passata", referenceFoodId = 43)
        val lines = listOf(RecipeIngredient(mince, grams = 600.0), RecipeIngredient(passata, grams = 300.0))
        // 900 g of ingredients cooked down to 600 — so the cooked weight this test is
        // named for is not the ingredient total, and dividing by the wrong one shows.
        val bolognese = Recipe(id = 3, name = "Bolognese", ingredients = lines, cookedWeightG = 600.0)
        val entries = listOf(WeighedEntry.log(day, bolognese.asFood(), grams = 200.0))

        val read = intake(
            entries,
            referenceFoods = mapOf(
                42L to referenceFood("Beef, mince, regular, raw", Micronutrient.IRON to 3.0, id = 42),
                43L to referenceFood("Tomato, puree, canned", Micronutrient.IRON to 1.0, id = 43),
            ),
            recipes = listOf(bolognese),
        )

        assertEquals(
            1.0,
            read.rows.single { it.nutrient == Micronutrient.IRON }.amount,
            "the batch holds 18 mg of iron in its 600 g of mince and 3 mg in its 300 g of " +
                "passata, and the 600 g it cooked down to re-expresses that (ADR 0019) — so " +
                "a 200 g serve is a third of the batch, 7 mg across the window, 1 mg a day",
        )
    }

    @Test
    fun `a partly matched Recipe supplies what its matched ingredients hold, not nothing`() {
        val lines = listOf(
            RecipeIngredient(food(id = 1, name = "Beef mince", referenceFoodId = 42), grams = 400.0),
            RecipeIngredient(food(id = 2, name = "Red lentils", referenceFoodId = 43), grams = 200.0),
            RecipeIngredient(food(id = 3, name = "Passata", referenceFoodId = 44), grams = 500.0),
            RecipeIngredient(food(id = 4, name = "Olive oil"), grams = 100.0),
            RecipeIngredient(food(id = 5, name = "Brown onion"), grams = 200.0),
        )
        val chilli = Recipe(id = 6, name = "Chilli", ingredients = lines, cookedWeightG = 1000.0)
        val entries = listOf(WeighedEntry.log(day, chilli.asFood(), grams = 500.0))

        val read = intake(
            entries,
            referenceFoods = mapOf(
                42L to referenceFood("Beef, mince, regular, raw", Micronutrient.IRON to 4.0, id = 42),
                43L to referenceFood("Lentil, red, dried", Micronutrient.IRON to 3.5, id = 43),
                44L to referenceFood("Tomato, puree, canned", Micronutrient.IRON to 1.0, id = 44),
            ),
            recipes = listOf(chilli),
        )

        assertEquals(
            2.0,
            read.rows.single { it.nutrient == Micronutrient.IRON }.amount,
            "half the batch was eaten, so the three matched ingredients put 8, 3.5 and " +
                "2.5 mg of iron into the window — all-or-none would report zero and throw " +
                "away something measured (ADR 0027)",
        )
    }

    @Test
    fun `a partly matched Recipe covers the share of its calories that came from matched ingredients`() {
        val chicken = food(
            id = 1,
            name = "Chicken thigh",
            referenceFoodId = 42,
            nutrition = perHundredGrams(100.0),
        )
        val oil = food(
            id = 2,
            name = "Olive oil",
            nutrition = perHundredGrams(900.0),
        )
        val lines = listOf(RecipeIngredient(chicken, grams = 300.0), RecipeIngredient(oil, grams = 100.0))
        val traybake = Recipe(id = 3, name = "Traybake", ingredients = lines, cookedWeightG = 1000.0)
        val entries = listOf(WeighedEntry.log(day, traybake.asFood(), grams = 500.0))

        val read = intake(entries, referenceFoods = aBorrow, recipes = listOf(traybake))

        assertEquals(
            0.25,
            read.coverage,
            "the chicken is 300 of the batch's 1200 calories and the oil the rest, so a " +
                "quarter of every serve can contribute — measured in calories, not in the " +
                "three grams-in-four the same batch would report",
        )
    }

    @Test
    fun `an ingredient is queued on what it contributed, even with no Entry of its own`() {
        val mince = food(id = 1, name = "Beef mince", nutrition = perHundredGrams(300.0))
        val passata = food(id = 2, name = "Passata", nutrition = perHundredGrams(100.0))
        val yoghurt = food(id = 3, name = "Greek yoghurt", nutrition = perHundredGrams(100.0))
        val lines = listOf(RecipeIngredient(mince, grams = 300.0), RecipeIngredient(passata, grams = 300.0))
        val chilli = Recipe(id = 4, name = "Chilli", ingredients = lines, cookedWeightG = 500.0)
        val entries = listOf(
            WeighedEntry.log(day, chilli.asFood(), grams = 250.0),
            WeighedEntry.log(day, yoghurt, grams = 200.0),
        )

        val read = intake(entries, mapOf(3L to yoghurt), recipes = listOf(chilli))

        assertEquals(
            listOf(
                UnmatchedFood(foodId = 1, name = "Beef mince", share = 0.5625),
                UnmatchedFood(foodId = 3, name = "Greek yoghurt", share = 0.25),
                UnmatchedFood(foodId = 2, name = "Passata", share = 0.1875),
            ),
            read.unmatched,
            "the mince is three quarters of the chilli's 600 calories and the passata the " +
                "rest, so both outrank or trail the yoghurt eaten on its own — a Food is " +
                "queued on what it contributed, through a Recipe or directly (ADR 0027)",
        )
    }

    @Test
    fun `matching an ingredient raises both the coverage share and the nutrients it holds`() {
        val oil = food(id = 2, name = "Olive oil", nutrition = perHundredGrams(900.0))
        fun weekOfCurry(mince: Food): MicronutrientIntake {
            val lines = listOf(RecipeIngredient(mince, grams = 300.0), RecipeIngredient(oil, grams = 100.0))
            val curry = Recipe(id = 3, name = "Keema curry", ingredients = lines, cookedWeightG = 350.0)
            return intake(
                listOf(WeighedEntry.log(day, curry.asFood(), grams = 350.0)),
                referenceFoods = mapOf(
                    42L to referenceFood("Beef, mince, regular, raw", Micronutrient.IRON to 3.5, id = 42),
                ),
                recipes = listOf(curry),
            )
        }

        val mince = food(id = 1, name = "Beef mince", nutrition = perHundredGrams(200.0))
        val before = weekOfCurry(mince)
        val after = weekOfCurry(mince.copy(referenceFoodId = 42))

        assertEquals(
            0.0 to 0.0,
            before.coverage to before.rows.single { it.nutrient == Micronutrient.IRON }.amount,
            "nothing in the dish is matched yet, so it covers nothing and holds nothing",
        )
        assertEquals(
            0.4 to 1.5,
            after.coverage to after.rows.single { it.nutrient == Micronutrient.IRON }.amount,
            "one tap on an ingredient the User never logged on its own earns the 600 of " +
                "the curry's 1500 calories that came from it, and the 10.5 mg of iron in " +
                "the 300 g of mince eaten with the batch (ADR 0027)",
        )
    }

    @Test
    fun `a Recipe recalibrated to cost nothing still covers the calories its Entry recorded`() {
        val leaves = food(id = 1, name = "Spinach", referenceFoodId = 42, nutrition = perHundredGrams(0.0))
        val lines = listOf(RecipeIngredient(leaves, grams = 1000.0))
        val broth = Recipe(id = 2, name = "Green broth", ingredients = lines, cookedWeightG = 1000.0)
        // The Entry snapshotted 300 calories and the Recipe was edited afterwards, so
        // today's ingredients no longer account for them: the borrow is live, the
        // Entry is not.
        val entries = listOf(
            WeighedEntry(id = null, loggedOn = day, foodId = 2, grams = 500.0, calories = 300.0, protein = 0.0),
        )

        val read = intake(entries, referenceFoods = aBorrow, recipes = listOf(broth))

        assertEquals(
            1.0,
            read.coverage,
            "the one ingredient is matched, so all of the window can contribute — " +
                "calories today's composition cannot account for still have to be " +
                "shared out, or they sit in the denominator with nothing in the " +
                "numerator and read as a rest the card blames on estimated meals",
        )
    }

    @Test
    fun `a Food eaten both on its own and inside a Recipe is one row carrying both`() {
        val rice = food(id = 1, name = "Jasmine rice", nutrition = perHundredGrams(100.0))
        val lines = listOf(RecipeIngredient(rice, grams = 300.0))
        val curry = Recipe(id = 2, name = "Curry", ingredients = lines, cookedWeightG = 300.0)
        val entries = listOf(
            WeighedEntry.log(day, rice, grams = 100.0),
            WeighedEntry.log(day, curry.asFood(), grams = 300.0),
        )

        val read = intake(entries, mapOf(1L to rice), recipes = listOf(curry))

        assertEquals(
            listOf(UnmatchedFood(foodId = 1, name = "Jasmine rice", share = 1.0)),
            read.unmatched,
            "100 calories loose and 300 inside the curry are one tap, not two — two " +
                "rows would each understate what matching the rice actually earns, and " +
                "ask the User to do the same thing twice",
        )
    }

    @Test
    fun `an Entry naming a Food the caller did not supply is refused, not quietly dropped`() {
        val chicken = food(id = 1, name = "Chicken breast")
        val entries = listOf(WeighedEntry.log(day, chicken, grams = 200.0))

        assertFailsWith<NoSuchElementException> {
            MicronutrientIntake.of(weekStart, day, entries, eaten = emptyMap(), references = null)
        }
    }

    @Test
    fun `a Recipe is never queued, because it is never matched — its ingredients are`() {
        val mince = food(id = 1, name = "Beef mince")
        val lines = listOf(RecipeIngredient(mince, grams = 900.0))
        val bolognese = Recipe(id = 3, name = "Bolognese", ingredients = lines, cookedWeightG = 900.0)
        val entries = listOf(WeighedEntry.log(day, bolognese.asFood(), grams = 300.0))

        val read = intake(entries, recipes = listOf(bolognese))

        assertEquals(
            listOf(UnmatchedFood(foodId = 1, name = "Beef mince", share = 1.0)),
            read.unmatched,
            "a Recipe rolls its micronutrients up from whichever ingredients are matched " +
                "(CONTEXT.md), so offering the dish itself would be an unusable tap — the " +
                "tap that can be taken is on the mince inside it",
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

    private fun intake(
        entries: List<Entry>,
        foods: Map<Long, Food> = emptyMap(),
        referenceFoods: Map<Long, ReferenceFood> = emptyMap(),
        // Null, not an empty map: absent means there was no body to resolve lines
        // for, which is the state `hasReferenceIntakes` exists to tell apart.
        references: Map<Micronutrient, ReferenceIntake>? = null,
        // Whole Recipes rather than a Food map beside a composition map: a Recipe
        // already knows its own id and its own lines, and stating either twice is an
        // agreement the test has to keep by hand.
        recipes: List<Recipe> = emptyList(),
    ) = MicronutrientIntake.of(
        weekStart,
        day,
        entries,
        joined(
            foods + recipes.associate { it.id!! to it.asFood() },
            referenceFoods,
            recipes.associate { it.id!! to it.ingredients },
        ),
        references,
    )

    /** Nutrition stated by its calories, where the macros behind them are beside the point. */
    private fun perHundredGrams(calories: Double) = Nutrition(
        caloriesPer100g = calories,
        proteinPer100g = 0.0,
        carbsPer100g = null,
        fatPer100g = null,
    )

    /** Something for a matched Food to point at where the figures are beside the point. */
    private val aBorrow = cheddarLikeIron(0.0)

    /** A Reference Food reporting [iron] mg per 100 g, keyed by the id Foods point at. */
    private fun cheddarLikeIron(iron: Double) =
        mapOf(42L to referenceFood("Chicken, breast", Micronutrient.IRON to iron, id = 42))

    /**
     * The Foods a window ate, each joined to what it borrows — what `of` reads. A
     * Recipe is joined to the composition it rolls up from, each ingredient line
     * carrying its own borrow, the way the controller assembles one.
     */
    private fun joined(
        foods: Map<Long, Food>,
        referenceFoods: Map<Long, ReferenceFood>,
        compositions: Map<Long, List<RecipeIngredient>> = emptyMap(),
    ) = foods.mapValues { (id, food) ->
        BorrowedFood(
            food,
            referenceFoods[food.referenceFoodId],
            compositions[id].orEmpty().map { line ->
                BorrowedIngredient(
                    BorrowedFood(line.ingredient, referenceFoods[line.ingredient.referenceFoodId]),
                    line.grams,
                )
            },
        )
    }

}
