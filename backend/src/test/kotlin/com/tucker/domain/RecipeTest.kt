package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RecipeTest {

    /** A plain ingredient Food with explicit per-100g nutrition. */
    private fun food(name: String, caloriesPer100g: Double, proteinPer100g: Double): Food =
        Food.plain(
            id = 1L,
            name = name,
            barcode = null,
            nutrition = Nutrition(caloriesPer100g, proteinPer100g, null, null),
        )

    @Test
    fun `nutrition rolls the weighed ingredients up per 100g of the cooked weight`() {
        // 500 g @ 100 kcal + 500 g @ 200 kcal = 1500 kcal total; 50 g + 100 g = 150 g protein.
        // Re-expressed over a 750 g finished dish: 1500 / 750 * 100 = 200 kcal, 20 g protein /100g.
        val recipe = Recipe(
            id = null,
            name = "Stew",
            ingredients = listOf(
                RecipeIngredient(food("Broth", caloriesPer100g = 100.0, proteinPer100g = 10.0), grams = 500.0),
                RecipeIngredient(food("Beef", caloriesPer100g = 200.0, proteinPer100g = 20.0), grams = 500.0),
            ),
            cookedWeightG = 750.0,
        )

        val n = recipe.nutrition()

        assertEquals(200.0, n.caloriesPer100g, 1e-9)
        assertEquals(20.0, n.proteinPer100g, 1e-9)
    }

    @Test
    fun `nutrition leaves carbs and fat null in the rollup`() {
        val recipe = Recipe(
            id = null,
            name = "Stew",
            ingredients = listOf(RecipeIngredient(food("Beef", 200.0, 20.0), grams = 500.0)),
            cookedWeightG = 500.0,
        )

        val n = recipe.nutrition()

        assertNull(n.carbsPer100g)
        assertNull(n.fatPer100g)
    }

    @Test
    fun `cooking a dish down concentrates its calories per 100g`() {
        val ingredients = listOf(
            RecipeIngredient(food("Broth", 100.0, 10.0), grams = 500.0),
            RecipeIngredient(food("Beef", 200.0, 20.0), grams = 500.0),
        )
        // Same 1500 kcal total; the denser (750 g) batch reads higher per 100g than the raw 1000 g sum.
        val cookedDown = Recipe(null, "Stew", ingredients, cookedWeightG = 750.0).nutrition()
        val uncooked = Recipe(null, "Stew", ingredients, cookedWeightG = 1000.0).nutrition()

        assertEquals(200.0, cookedDown.caloriesPer100g, 1e-9)
        assertEquals(150.0, uncooked.caloriesPer100g, 1e-9)
    }

    @Test
    fun `a blank name is rejected`() {
        assertThrows<IllegalArgumentException> {
            Recipe(null, "  ", listOf(RecipeIngredient(food("Beef", 200.0, 20.0), 500.0)), cookedWeightG = 500.0)
        }
    }

    @Test
    fun `a recipe with no ingredients is rejected`() {
        assertThrows<IllegalArgumentException> {
            Recipe(null, "Stew", emptyList(), cookedWeightG = 500.0)
        }
    }

    @Test
    fun `a non-positive cooked weight is rejected`() {
        assertThrows<IllegalArgumentException> {
            Recipe(null, "Stew", listOf(RecipeIngredient(food("Beef", 200.0, 20.0), 500.0)), cookedWeightG = 0.0)
        }
    }

    @Test
    fun `a non-positive ingredient weight is rejected`() {
        assertThrows<IllegalArgumentException> {
            RecipeIngredient(food("Beef", 200.0, 20.0), grams = 0.0)
        }
    }

    @Test
    fun `a recipe cannot be an ingredient — no nested recipes`() {
        val nested = Food(
            id = 2L,
            name = "Stew",
            kind = FoodKind.RECIPE,
            barcode = null,
            nutrition = Nutrition(200.0, 20.0, null, null),
            cookedWeightG = 500.0,
        )
        assertThrows<IllegalArgumentException> {
            RecipeIngredient(nested, grams = 100.0)
        }
    }
}
