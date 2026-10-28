package com.tucker.provider

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * The Open Food Facts product JSON → [com.tucker.domain.FoodCandidate] mapping,
 * tested against representative OFF response fixtures (full, partial macros,
 * per-100ml, and miss). The provider's HTTP fetch is exercised separately; this
 * pins the normalisation contract from ADR 0006.
 */
class OpenFoodFactsMappingTest {

    private val mapper = jacksonObjectMapper()

    private fun mapFixture(barcode: String, json: String) =
        OpenFoodFactsProvider.toCandidate(barcode, mapper.readValue(json, OffResponse::class.java))

    @Test
    fun `maps a full OFF product to a per-100g candidate with the OFF stated energy`() {
        val candidate = mapFixture(
            "5701234567890",
            """
            {
              "status": 1,
              "product": {
                "product_name": "Skyr Natural",
                "nutriments": {
                  "proteins_100g": 10.3,
                  "carbohydrates_100g": 4.0,
                  "fat_100g": 0.2,
                  "energy-kcal_100g": 63
                }
              }
            }
            """.trimIndent(),
        )!!

        assertEquals("Skyr Natural", candidate.name)
        assertEquals("5701234567890", candidate.barcode)
        assertEquals(10.3, candidate.proteinPer100g)
        assertEquals(4.0, candidate.carbsPer100g)
        assertEquals(0.2, candidate.fatPer100g)
        assertEquals(63.0, candidate.statedEnergyKcalPer100g)
        assertEquals("Open Food Facts", candidate.source)
    }

    @Test
    fun `keeps a macro OFF omits absent rather than zero`() {
        // OFF here has no fat figure — the Candidate must surface it as absent so
        // the user is forced to fill it in, never as a silent 0.
        val candidate = mapFixture(
            "5709876543210",
            """
            {
              "status": 1,
              "product": {
                "product_name": "Mystery bar",
                "nutriments": {
                  "proteins_100g": 8.0,
                  "carbohydrates_100g": 60.0,
                  "energy-kcal_100g": 400
                }
              }
            }
            """.trimIndent(),
        )!!

        assertEquals(8.0, candidate.proteinPer100g)
        assertEquals(60.0, candidate.carbsPer100g)
        assertNull(candidate.fatPer100g)
    }

    @Test
    fun `leaves fibre and alcohol OFF omits not stated`() {
        val candidate = mapFixture(
            "5701234567890",
            """
            {
              "status": 1,
              "product": {
                "product_name": "Skyr Natural",
                "nutriments": { "proteins_100g": 10.3, "carbohydrates_100g": 4.0, "fat_100g": 0.2 }
              }
            }
            """.trimIndent(),
        )

        assertNotNull(candidate)
        assertNull(candidate.fibrePer100g)
        assertNull(candidate.alcoholPer100g)
    }

    @Test
    fun `treats OFF per-100ml values as per-100g at density 1`() {
        // A beverage's nutriments are published per 100 ml; v1 assumes water density
        // (1 g/ml) and passes them straight through as per-100g. See ADR 0006.
        val candidate = mapFixture(
            "5700000000017",
            """
            {
              "status": 1,
              "product": {
                "product_name": "Orange juice",
                "nutriment_data_per": "100ml",
                "nutriments": {
                  "proteins_100g": 0.7,
                  "carbohydrates_100g": 10.4,
                  "fat_100g": 0.2,
                  "energy-kcal_100g": 45
                }
              }
            }
            """.trimIndent(),
        )!!

        assertEquals(0.7, candidate.proteinPer100g)
        assertEquals(10.4, candidate.carbsPer100g)
        assertEquals(0.2, candidate.fatPer100g)
    }

    @Test
    fun `maps OFF fiber_100g to the candidate's fibre`() {
        // The wrap's real OFF record, its per-100g figures as OFF published them.
        val candidate = mapFixture(
            "9334169000566",
            """
            {
              "status": 1,
              "product": {
                "product_name": "HIGH PROTEIN LOW CARB + FIBRE WRAPS",
                "nutriments": {
                  "carbohydrates_100g": 29.4285714285714,
                  "energy-kcal_100g": 246,
                  "fat_100g": 9.28571428571429,
                  "fiber_100g": 16.7142857142857,
                  "proteins_100g": 19.4285714285714
                }
              }
            }
            """.trimIndent(),
        )!!

        assertEquals(16.7142857142857, candidate.fibrePer100g)
    }

    @Test
    fun `reads OFF alcohol_100g as ABV and converts it to grams per 100 g`() {
        // Heineken's real OFF record: alcohol_100g is % vol whatever its name says,
        // so 5 reads as 5 × 0.789 g of ethanol per 100 g.
        val candidate = mapFixture(
            "8712000900045",
            """
            {
              "status": 1,
              "product": {
                "product_name": "Heineken Beer",
                "nutriments": {
                  "alcohol_100g": 5,
                  "carbohydrates_100g": 3.2,
                  "energy-kcal_100g": 42,
                  "fat_100g": 0,
                  "proteins_100g": 0
                }
              }
            }
            """.trimIndent(),
        )!!

        assertEquals(3.945, assertNotNull(candidate.alcoholPer100g), 1e-9)
    }

    @Test
    fun `leaves an alcohol_100g above 100 percent not stated and keeps the rest of the product`() {
        // OFF is crowd-sourced: no drink is 150 % vol, so the figure is dropped
        // rather than costing the User the whole scan.
        val candidate = mapFixture(
            "8712000900045",
            """
            {
              "status": 1,
              "product": {
                "product_name": "Heineken Beer",
                "nutriments": {
                  "alcohol_100g": 150,
                  "carbohydrates_100g": 3.2,
                  "fat_100g": 0,
                  "proteins_100g": 0
                }
              }
            }
            """.trimIndent(),
        )

        assertNotNull(candidate)
        assertNull(candidate.alcoholPer100g)
        assertEquals(3.2, candidate.carbsPer100g)
    }

    @Test
    fun `leaves a negative fiber_100g not stated and keeps the rest of the product`() {
        val candidate = mapFixture(
            "9334169000566",
            """
            {
              "status": 1,
              "product": {
                "product_name": "HIGH PROTEIN LOW CARB + FIBRE WRAPS",
                "nutriments": {
                  "carbohydrates_100g": 29.4285714285714,
                  "fat_100g": 9.28571428571429,
                  "fiber_100g": -16.7142857142857,
                  "proteins_100g": 19.4285714285714
                }
              }
            }
            """.trimIndent(),
        )

        assertNotNull(candidate)
        assertNull(candidate.fibrePer100g)
        assertEquals(19.4285714285714, candidate.proteinPer100g)
    }

    @Test
    fun `a miss (status 0) maps to null`() {
        val candidate = mapFixture(
            "0000000000000",
            """{ "status": 0, "product": null }""",
        )

        assertNull(candidate)
    }
}
