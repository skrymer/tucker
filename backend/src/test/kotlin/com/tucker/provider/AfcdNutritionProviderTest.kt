package com.tucker.provider

import com.tucker.domain.BarcodeLookup
import com.tucker.domain.ProviderCapability
import com.tucker.persistence.FoodRepository
import com.tucker.service.BarcodeLookupService
import com.tucker.service.InMemoryBarcodeLookupCache
import org.junit.jupiter.api.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.never
import org.mockito.kotlin.spy
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import kotlin.test.assertEquals

/**
 * The Australian Food Composition Database as a **Nutrition Provider** — the
 * `TEXT_SEARCH` capability ADR 0006 defined and left a seam for, finally filled.
 *
 * AFCD is the mirror image of a barcode source: rich micronutrient detail on
 * *generic* foods, and no barcodes at all (ADR 0027).
 */
class AfcdNutritionProviderTest {

    @Test
    fun `AFCD is found by name and never by barcode`() {
        assertEquals(
            setOf(ProviderCapability.TEXT_SEARCH),
            AfcdNutritionProvider().capabilities,
            "AFCD holds no barcode at all, so declaring BARCODE_LOOKUP would put a " +
                "source that can never answer into the scan chain",
        )
    }

    @Test
    fun `a scanned barcode never reaches AFCD`() {
        val afcd = spy(AfcdNutritionProvider())
        val foods = mock<FoodRepository>()
        whenever(foods.findByBarcode(any())).thenReturn(null)
        val chain = BarcodeLookupService(foods, listOf(afcd), InMemoryBarcodeLookupCache())

        val result = chain.lookup("9310072011691")

        verify(afcd, never()).lookupByBarcode(any())
        assertEquals(
            BarcodeLookup.Missing,
            result,
            "a chain holding no barcode-capable Provider knows nothing rather than being " +
                "broken, so it is a miss and not an Inconclusive Lookup (ADR 0006)",
        )
    }
}
