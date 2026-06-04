package com.tucker.api

import com.tucker.domain.Food
import com.tucker.domain.FoodCandidate
import com.tucker.domain.Nutrition
import com.tucker.domain.ProviderCapability
import com.tucker.persistence.FoodRepository
import com.tucker.provider.OpenFoodFactsProvider
import org.junit.jupiter.api.Test
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
class FoodBarcodeApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var foods: FoodRepository

    @MockitoBean lateinit var openFoodFacts: OpenFoodFactsProvider

    @Test
    fun `a catalog hit returns 200 EXISTING with the saved Food`() {
        foods.insert(
            Food.plain(null, "Skyr", "5701234567890", Nutrition.fromMacros(10.0, 4.0, 0.2)),
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
            FoodCandidate(
                name = "Mystery bar",
                barcode = "5709999999999",
                proteinPer100g = 8.0,
                carbsPer100g = 60.0,
                fatPer100g = null,
                statedEnergyKcalPer100g = 400.0,
                source = "Open Food Facts",
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
    fun `a total miss returns 404`() {
        whenever(openFoodFacts.capabilities).thenReturn(setOf(ProviderCapability.BARCODE_LOOKUP))
        whenever(openFoodFacts.lookupByBarcode("0000000000000")).thenReturn(null)

        mockMvc.get("/api/foods/barcode/0000000000000").andExpect {
            status { isNotFound() }
        }
    }
}
