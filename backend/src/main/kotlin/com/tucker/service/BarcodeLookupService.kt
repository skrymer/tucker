package com.tucker.service

import com.tucker.domain.BarcodeLookup
import com.tucker.domain.NutritionProvider
import com.tucker.domain.ProviderCapability
import com.tucker.persistence.FoodRepository
import org.springframework.stereotype.Service

/**
 * Resolves a barcode **catalog-first, then through the ordered Provider chain**
 * (ADR 0006). A catalog match returns the saved [com.tucker.domain.Food]; otherwise
 * each barcode-capable [NutritionProvider] is tried in order, first match wins; a
 * miss (or every Provider falling through) returns `null`.
 *
 * The order of trust is server-side policy, not something the UI decides
 * (ADR 0002). The Provider list is injected in bean order — the operator's
 * deployment config — and is **not** user-selectable.
 */
@Service
class BarcodeLookupService(
    private val foods: FoodRepository,
    private val providers: List<NutritionProvider>,
) {

    /** Resolve [barcode]; see the class doc for the resolution order. */
    fun lookup(barcode: String): BarcodeLookup? {
        val existing = foods.findByBarcode(barcode)
        if (existing != null) return BarcodeLookup.Existing(existing)

        // First barcode-capable Provider with a hit wins. A slow/failed/429 Provider
        // must not sink the whole lookup — swallow it and fall through (ADR 0006).
        val candidate = providers
            .filter { ProviderCapability.BARCODE_LOOKUP in it.capabilities }
            .firstNotNullOfOrNull { runCatching { it.lookupByBarcode(barcode) }.getOrNull() }
        return candidate?.let { BarcodeLookup.Candidate(it) }
    }
}
