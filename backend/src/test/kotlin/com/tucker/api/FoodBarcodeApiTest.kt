package com.tucker.api

import com.tucker.domain.Food
import com.tucker.domain.FoodCandidate
import com.tucker.domain.Macros
import com.tucker.domain.ProviderCapability
import com.tucker.domain.ProviderLookup
import com.tucker.persistence.FoodRepository
import com.tucker.provider.OpenFoodFactsProvider
import com.tucker.security.WithTuckerUser
import org.hamcrest.Matchers.closeTo
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional

/**
 * The repurposed discriminated barcode endpoint (ADR 0006). The real
 * [com.tucker.service.BarcodeLookupService] and [FoodRepository] run; only the
 * external OFF Provider is mocked, so no network is touched.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class FoodBarcodeApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var foods: FoodRepository

    @MockitoBean lateinit var openFoodFacts: OpenFoodFactsProvider

    @Test
    fun `a catalog hit returns 200 EXISTING with the saved Food`() {
        foods.insert(
            Food.plain(foods.nextId(), "Skyr", "5701234567890", Macros(10.0, 4.0, 0.2).nutrition()),
        )

        mockMvc.get("/api/foods/barcode/5701234567890").andExpect {
            status { isOk() }
            jsonPath("$.outcome") { value("EXISTING") }
            jsonPath("$.food.name") { value("Skyr") }
            jsonPath("$.food.barcode") { value("5701234567890") }
            jsonPath("$.candidate") { doesNotExist() }
        }
    }

    @Test
    fun `a catalog miss with a Provider hit returns 200 CANDIDATE with the candidate`() {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("5709999999999")).thenReturn(
            ProviderLookup.Found(
                FoodCandidate(
                    name = "Mystery bar",
                    barcode = "5709999999999",
                    proteinPer100g = 8.0,
                    carbsPer100g = 60.0,
                    fatPer100g = null,
                    statedEnergyKcalPer100g = 400.0,
                    source = "Open Food Facts",
                ),
            ),
        )

        mockMvc.get("/api/foods/barcode/5709999999999").andExpect {
            status { isOk() }
            jsonPath("$.outcome") { value("CANDIDATE") }
            jsonPath("$.candidate.name") { value("Mystery bar") }
            jsonPath("$.candidate.proteinPer100g") { value(8.0) }
            jsonPath("$.candidate.fatPer100g") { doesNotExist() }
            jsonPath("$.candidate.statedEnergyKcalPer100g") { value(400.0) }
            jsonPath("$.candidate.source") { value("Open Food Facts") }
            jsonPath("$.food") { doesNotExist() }
        }
    }

    @Test
    fun `a candidate carries its fibre, and its alcohol both in grams and as the ABV the form reads`() {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("8712000900045")).thenReturn(
            ProviderLookup.Found(
                FoodCandidate(
                    name = "Heineken Beer",
                    barcode = "8712000900045",
                    proteinPer100g = 0.0,
                    carbsPer100g = 3.2,
                    fatPer100g = 0.0,
                    statedEnergyKcalPer100g = 42.0,
                    source = "Open Food Facts",
                    fibrePer100g = 0.4,
                    alcoholPer100g = 3.945,
                ),
            ),
        )

        mockMvc.get("/api/foods/barcode/8712000900045").andExpect {
            status { isOk() }
            jsonPath("$.candidate.fibrePer100g") { value(0.4) }
            jsonPath("$.candidate.alcoholPer100g") { value(3.945) }
            jsonPath("$.candidate.alcoholAbv") { value(5.0) }
        }
    }

    @Test
    fun `a candidate with fibre folded into its carbs offers them without it, and names both figures`() {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("9334169000566")).thenReturn(
            ProviderLookup.Found(
                FoodCandidate(
                    name = "HIGH PROTEIN LOW CARB + FIBRE WRAPS",
                    barcode = "9334169000566",
                    proteinPer100g = 19.4285714285714,
                    carbsPer100g = 29.4285714285714,
                    fatPer100g = 9.28571428571429,
                    statedEnergyKcalPer100g = 246.0,
                    source = "Open Food Facts",
                    fibrePer100g = 16.7142857142857,
                ),
            ),
        )

        mockMvc.get("/api/foods/barcode/9334169000566").andExpect {
            status { isOk() }
            jsonPath("$.candidate.carbsPer100g", closeTo(12.7142857142857, 1e-9))
            jsonPath("$.candidate.providerCarbsPer100g", closeTo(29.4285714285714, 1e-9))
            jsonPath("$.candidate.adjustedCarbsPer100g", closeTo(12.7142857142857, 1e-9))
        }
    }

    @Test
    fun `a candidate with nothing folded into its carbs offers them as given, with no adjustment named`() {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("9334169000573")).thenReturn(
            ProviderLookup.Found(
                FoodCandidate(
                    name = "Protein wrap",
                    barcode = "9334169000573",
                    proteinPer100g = 19.4,
                    carbsPer100g = 12.8,
                    fatPer100g = 9.3,
                    statedEnergyKcalPer100g = 246.0,
                    source = "Open Food Facts",
                    fibrePer100g = 16.8,
                ),
            ),
        )

        mockMvc.get("/api/foods/barcode/9334169000573").andExpect {
            status { isOk() }
            jsonPath("$.candidate.carbsPer100g") { value(12.8) }
            jsonPath("$.candidate.providerCarbsPer100g") { value(null) }
            jsonPath("$.candidate.adjustedCarbsPer100g") { value(null) }
        }
    }

    @Test
    fun `a second look-up of the same barcode is served from the cache without a second Provider call`() {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("5702222222222")).thenReturn(
            ProviderLookup.Found(
                FoodCandidate(
                    name = "Cached bar",
                    barcode = "5702222222222",
                    proteinPer100g = 8.0,
                    carbsPer100g = 60.0,
                    fatPer100g = 5.0,
                    statedEnergyKcalPer100g = 400.0,
                    source = "Open Food Facts",
                ),
            ),
        )

        repeat(2) {
            mockMvc.get("/api/foods/barcode/5702222222222").andExpect {
                status { isOk() }
                jsonPath("$.outcome") { value("CANDIDATE") }
                jsonPath("$.candidate.name") { value("Cached bar") }
            }
        }

        verify(openFoodFacts, times(1)).lookupByBarcode("5702222222222")
    }

    @Test
    fun `a total miss returns 404`() {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("0000000000000")).thenReturn(ProviderLookup.Missing)

        mockMvc.get("/api/foods/barcode/0000000000000").andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `a lookup no Provider could answer is distinguishable from a miss`() {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("0000000000001"))
            .thenReturn(ProviderLookup.Inconclusive)

        // A 404 here would tell the client the product does not exist, which is
        // exactly what nobody managed to find out.
        mockMvc.get("/api/foods/barcode/0000000000001").andExpect {
            status { isServiceUnavailable() }
            jsonPath("$.message") { value(containsString("0000000000001")) }
        }
    }
}
