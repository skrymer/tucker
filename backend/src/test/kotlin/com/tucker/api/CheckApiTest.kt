package com.tucker.api

import com.tucker.domain.Food
import com.tucker.domain.FoodCandidate
import com.tucker.domain.Maintenance
import com.tucker.domain.Nutrition
import com.tucker.domain.ProviderCapability
import com.tucker.domain.WeeklyReview
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.provider.OpenFoodFactsProvider
import org.hamcrest.BaseMatcher
import org.hamcrest.Description
import org.hamcrest.Matcher
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.never
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import java.time.LocalDate
import kotlin.math.abs

/**
 * `GET /api/check/{barcode}` (ADR 0022) — a Check composes the existing barcode
 * lookup with the day's targets. The real lookup chain and repositories run; only
 * the external Provider is mocked, so no network is touched.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CheckApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var reviews: WeeklyReviewRepository
    @Autowired lateinit var foods: FoodRepository

    @MockitoBean lateinit var openFoodFacts: OpenFoodFactsProvider

    private val nutellaBarcode = "3017620422003"

    /**
     * A JSON number reaches the matcher as a Double or a BigDecimal depending on
     * how many digits it carries, so tolerance is asserted against Number itself.
     */
    private fun near(expected: Double, tolerance: Double = 1e-3): Matcher<Any> =
        object : BaseMatcher<Any>() {
            override fun matches(actual: Any?) =
                actual is Number && abs(actual.toDouble() - expected) <= tolerance

            override fun describeTo(description: Description) {
                description.appendText("a number within $tolerance of $expected")
            }
        }

    /** A review inserted directly, standing in for one the adaptive engine ran. */
    private fun seedTargets(budgetKcal: Double = 2492.0, floorG: Double = 170.0) {
        reviews.insert(
            WeeklyReview(
                id = null,
                reviewedOn = LocalDate.now(),
                trendWeightKg = 86.0,
                maintenance = Maintenance(2400.0, Maintenance.Basis.FORMULA_SEED),
                calorieBudgetKcal = budgetKcal,
                proteinFloorG = floorG,
            ),
        )
    }

    private fun providerKnows(barcode: String, candidate: FoodCandidate) {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode(barcode)).thenReturn(candidate)
    }

    private fun nutella(barcode: String) = FoodCandidate(
        name = "Nutella",
        barcode = barcode,
        proteinPer100g = 6.3,
        carbsPer100g = 57.5,
        fatPer100g = 30.9,
        statedEnergyKcalPer100g = 539.0,
        source = "Open Food Facts",
    )

    @Test
    fun `a scanned product states what 100 g costs and returns against the day's targets`() {
        seedTargets()
        providerKnows(nutellaBarcode, nutella(nutellaBarcode))

        mockMvc.get("/api/check/$nutellaBarcode").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("Nutella") }
            jsonPath("$.barcode") { value(nutellaBarcode) }
            jsonPath("$.costSharePer100g", near(0.214))
            jsonPath("$.returnSharePer100g", near(0.037))
            // ODbL attribution travels with the figures (ADR 0006) — the screen
            // shows a Provider's data and has to say whose.
            jsonPath("$.source") { value("Open Food Facts") }
        }
    }

    @Test
    fun `a Check carries the portion-invariant rules and the targets they are measured against`() {
        seedTargets()
        providerKnows(nutellaBarcode, nutella(nutellaBarcode))

        mockMvc.get("/api/check/$nutellaBarcode").andExpect {
            status { isOk() }
            // The pace the user's own targets imply, and the Food's own figure against it.
            jsonPath("$.paceGPer100Kcal", near(6.82, 1e-2))
            jsonPath("$.proteinPer100Kcal", near(1.18, 1e-2))
            jsonPath("$.balanceProteinPer100gG", near(30.1, 1e-1))
            // A whole day of nothing but Nutella, and what it still leaves owing.
            jsonPath("$.gramsInBudget", near(467.3, 1e-1))
            jsonPath("$.wholeDayProteinShortfallG", near(140.6, 1e-1))
            // The denominators, so the screen can state the figures as fractions of them.
            jsonPath("$.calorieBudgetKcal", near(2492.0, 1e-6))
            jsonPath("$.proteinFloorG", near(170.0, 1e-6))
            // Calories are Atwater-derived from the macros; the Provider's stated
            // 539 kcal is not used to compute anything.
            jsonPath("$.caloriesPer100g", near(533.3, 1e-1))
            jsonPath("$.proteinPer100g", near(6.3, 1e-6))
            jsonPath("$.carbsPer100g", near(57.5, 1e-6))
            jsonPath("$.fatPer100g", near(30.9, 1e-6))
            // The macro split, so the screen can draw composition without
            // re-deriving the Atwater factors in the client (ADR 0002).
            jsonPath("$.proteinEnergyShare", near(0.047))
            jsonPath("$.carbsEnergyShare", near(0.431))
            jsonPath("$.fatEnergyShare", near(0.521))
        }
    }

    @Test
    fun `a barcode nothing knows is a 404`() {
        seedTargets()
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("9999999999999")).thenReturn(null)

        mockMvc.get("/api/check/9999999999999").andExpect { status { isNotFound() } }
    }

    @Test
    fun `a Check is refused before setup has produced a Calorie Budget`() {
        // No review seeded: every figure a Check states is a share of the Budget or
        // the Floor, so with neither there is nothing honest to say (ADR 0022).
        providerKnows(nutellaBarcode, nutella(nutellaBarcode))

        mockMvc.get("/api/check/$nutellaBarcode").andExpect { status { isConflict() } }
    }

    @Test
    fun `a Food already in the catalog is checked without consulting a Provider`() {
        seedTargets()
        foods.insert(
            Food.plain(
                id = null,
                name = "My skyr",
                barcode = "5701234567890",
                nutrition = Nutrition.fromMacros(proteinPer100g = 10.0, carbsPer100g = 4.0, fatPer100g = 0.2),
            ),
        )

        mockMvc.get("/api/check/5701234567890").andExpect {
            status { isOk() }
            jsonPath("$.name") { value("My skyr") }
            jsonPath("$.caloriesPer100g", near(57.8, 1e-1))
            jsonPath("$.proteinPer100Kcal", near(17.3, 1e-1))
            // The user's own Food owes no attribution to anyone.
            jsonPath("$.source") { doesNotExist() }
        }
        verify(openFoodFacts, never()).lookupByBarcode(any())
    }

    @Test
    fun `a product whose Provider macros are incomplete cannot be checked`() {
        seedTargets()
        // Calories are Atwater-derived from all three macros, and an absent macro
        // is never defaulted to zero (ADR 0006) — so there is no honest Check to
        // state, and inventing one would misstate what the product costs.
        providerKnows(
            "5708888888888",
            FoodCandidate(
                name = "Mystery bar",
                barcode = "5708888888888",
                proteinPer100g = 8.0,
                carbsPer100g = 60.0,
                fatPer100g = null,
                statedEnergyKcalPer100g = 400.0,
                source = "Open Food Facts",
            ),
        )

        // 422, not the 404 of a genuine miss nor the 409 of a missing Budget: the
        // product exists and rescanning will never help, so the client can give
        // advice that differs from "try again in a moment" (ADR 0022).
        mockMvc.get("/api/check/5708888888888").andExpect {
            status { isUnprocessableEntity() }
            jsonPath("$.message") { value(containsString("Mystery bar")) }
        }
    }

    @Test
    fun `a calorie-free product states no ratio and no allowance instead of NaN`() {
        seedTargets()
        // Atwater-derived calories mean a 0 kcal product has no macros either — a
        // diet drink. Every figure that divides by its calories is undefined, and
        // must reach the wire as an absent field, never NaN or Infinity.
        providerKnows(
            "5449000131805",
            FoodCandidate(
                name = "Cola Zero",
                barcode = "5449000131805",
                proteinPer100g = 0.0,
                carbsPer100g = 0.0,
                fatPer100g = 0.0,
                statedEnergyKcalPer100g = 0.3,
                source = "Open Food Facts",
            ),
        )

        mockMvc.get("/api/check/5449000131805").andExpect {
            status { isOk() }
            jsonPath("$.costSharePer100g", near(0.0, 1e-9))
            jsonPath("$.returnSharePer100g", near(0.0, 1e-9))
            jsonPath("$.proteinPer100Kcal") { doesNotExist() }
            jsonPath("$.gramsInBudget") { doesNotExist() }
            jsonPath("$.wholeDayProteinShortfallG") { doesNotExist() }
            jsonPath("$.proteinEnergyShare") { doesNotExist() }
            jsonPath("$.carbsEnergyShare") { doesNotExist() }
            jsonPath("$.fatEnergyShare") { doesNotExist() }
        }
    }
}
