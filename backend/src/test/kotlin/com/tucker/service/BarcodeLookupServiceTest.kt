package com.tucker.service

import com.tucker.domain.BarcodeLookup
import com.tucker.domain.Food
import com.tucker.domain.FoodCandidate
import com.tucker.domain.Nutrition
import com.tucker.domain.NutritionProvider
import com.tucker.domain.ProviderCapability
import com.tucker.domain.ProviderLookup
import com.tucker.persistence.FoodRepository
import org.junit.jupiter.api.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BarcodeLookupServiceTest {

    private val foods = mock<FoodRepository>()

    /** A fake Provider that records whether it was consulted and returns a fixed result. */
    private class StubProvider(
        private val result: ProviderLookup,
        override val capabilities: Set<ProviderCapability> = setOf(ProviderCapability.BARCODE_LOOKUP),
        private val fail: Boolean = false,
    ) : NutritionProvider {
        var consulted = false
        var calls = 0
        override fun lookupByBarcode(barcode: String): ProviderLookup {
            consulted = true
            calls++
            if (fail) error("provider exploded (timeout / 429)")
            return result
        }
    }

    private fun candidate(barcode: String) = FoodCandidate(
        name = "Skyr", barcode = barcode,
        proteinPer100g = 10.0, carbsPer100g = 4.0, fatPer100g = 0.2,
        statedEnergyKcalPer100g = 63.0, source = "Open Food Facts",
    )

    private fun found(barcode: String) = ProviderLookup.Found(candidate(barcode))

    private fun existingFood(barcode: String) = Food.plain(
        id = 7, name = "Skyr", barcode = barcode,
        nutrition = Nutrition.fromMacros(10.0, 4.0, 0.2),
    )

    @Test
    fun `a catalog hit returns the saved Food without consulting any Provider`() {
        val provider = StubProvider(found("5701234567890"))
        whenever(foods.findByBarcode("5701234567890")).thenReturn(existingFood("5701234567890"))
        val service = BarcodeLookupService(foods, listOf(provider), InMemoryBarcodeLookupCache())

        val result = service.lookup("5701234567890")

        assertEquals(BarcodeLookup.Existing(existingFood("5701234567890")), result)
        assertTrue(!provider.consulted, "providers must not be consulted on a catalog hit")
    }

    @Test
    fun `a catalog miss with a Provider hit returns a Candidate`() {
        whenever(foods.findByBarcode("5701234567890")).thenReturn(null)
        val service = BarcodeLookupService(
            foods,
            listOf(StubProvider(found("5701234567890"))),
            InMemoryBarcodeLookupCache(),
        )

        val result = service.lookup("5701234567890")

        assertEquals(BarcodeLookup.Candidate(candidate("5701234567890")), result)
    }

    @Test
    fun `a text-search-only Provider is not consulted in a barcode scan`() {
        whenever(foods.findByBarcode("5701234567890")).thenReturn(null)
        val searchOnly = StubProvider(
            found("5701234567890"),
            capabilities = setOf(ProviderCapability.TEXT_SEARCH),
        )
        val service = BarcodeLookupService(foods, listOf(searchOnly), InMemoryBarcodeLookupCache())

        assertEquals(BarcodeLookup.Missing, service.lookup("5701234567890"))
        assertTrue(!searchOnly.consulted, "a non-barcode Provider must be skipped")
    }

    @Test
    fun `a barcode resolved via a Provider is served from cache without consulting the Provider again`() {
        whenever(foods.findByBarcode("5701234567890")).thenReturn(null)
        val provider = StubProvider(found("5701234567890"))
        val service = BarcodeLookupService(foods, listOf(provider), InMemoryBarcodeLookupCache())

        val first = service.lookup("5701234567890")
        val second = service.lookup("5701234567890")

        assertEquals(BarcodeLookup.Candidate(candidate("5701234567890")), first)
        assertEquals(BarcodeLookup.Candidate(candidate("5701234567890")), second)
        assertEquals(1, provider.calls, "the second look-up must be served from the cache")
    }

    @Test
    fun `a miss is not cached so a later look-up still consults the Provider`() {
        whenever(foods.findByBarcode("5701234567890")).thenReturn(null)
        // The product is unknown on the first look-up, then a Provider learns it.
        val provider = object : NutritionProvider {
            override val capabilities = setOf(ProviderCapability.BARCODE_LOOKUP)
            var calls = 0
            override fun lookupByBarcode(barcode: String): ProviderLookup {
                calls++
                return if (calls == 1) ProviderLookup.Missing else found(barcode)
            }
        }
        val service = BarcodeLookupService(foods, listOf(provider), InMemoryBarcodeLookupCache())

        assertEquals(BarcodeLookup.Missing, service.lookup("5701234567890"))
        val second = service.lookup("5701234567890")

        assertEquals(BarcodeLookup.Candidate(candidate("5701234567890")), second)
        assertEquals(2, provider.calls, "a miss must not be cached")
    }

    @Test
    fun `a lookup no Provider could answer reaches no verdict rather than a miss`() {
        whenever(foods.findByBarcode("5701234567890")).thenReturn(null)
        val unreachable = StubProvider(ProviderLookup.Inconclusive)
        val service = BarcodeLookupService(foods, listOf(unreachable), InMemoryBarcodeLookupCache())

        assertEquals(BarcodeLookup.Inconclusive, service.lookup("5701234567890"))
    }

    @Test
    fun `a Provider that could not answer is not spoken for by a later Provider's no`() {
        whenever(foods.findByBarcode("5701234567890")).thenReturn(null)
        val unreachable = StubProvider(ProviderLookup.Inconclusive)
        val answered = StubProvider(ProviderLookup.Missing)
        val service = BarcodeLookupService(
            foods,
            listOf(unreachable, answered),
            InMemoryBarcodeLookupCache(),
        )

        // The second Provider only knows its own catalogue. Letting its "no" settle
        // the lookup would report a product as unknown on the word of a source that
        // was never the one being asked.
        assertEquals(BarcodeLookup.Inconclusive, service.lookup("5701234567890"))
        assertTrue(answered.consulted, "the chain must still fall through to the next Provider")
    }

    @Test
    fun `a Provider that throws is one that did not answer, not one that said no`() {
        whenever(foods.findByBarcode("5701234567890")).thenReturn(null)
        val broken = StubProvider(ProviderLookup.Missing, fail = true)
        val service = BarcodeLookupService(foods, listOf(broken), InMemoryBarcodeLookupCache())

        assertEquals(BarcodeLookup.Inconclusive, service.lookup("5701234567890"))
    }

    @Test
    fun `a failing Provider falls through to the next`() {
        whenever(foods.findByBarcode("5701234567890")).thenReturn(null)
        val flaky = StubProvider(ProviderLookup.Missing, fail = true)
        val healthy = StubProvider(found("5701234567890"))
        val service = BarcodeLookupService(foods, listOf(flaky, healthy), InMemoryBarcodeLookupCache())

        val result = service.lookup("5701234567890")

        assertEquals(BarcodeLookup.Candidate(candidate("5701234567890")), result)
        assertTrue(flaky.consulted, "the failing Provider should have been tried")
    }
}
