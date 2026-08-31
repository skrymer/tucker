package com.tucker.provider

import com.tucker.domain.NutritionProvider
import com.tucker.domain.ProviderCapability
import com.tucker.domain.ProviderLookup
import org.springframework.stereotype.Component

/**
 * The Australian Food Composition Database as a [NutritionProvider] — the
 * `TEXT_SEARCH` capability ADR 0006 defined and left a seam for (ADR 0027).
 *
 * The mirror image of a barcode source: rich micronutrient detail on *generic*
 * foods, and no barcodes at all, because AFCD describes food rather than products.
 * So it declares [ProviderCapability.TEXT_SEARCH] alone and the barcode chain is
 * unchanged — [com.tucker.service.BarcodeLookupService] consults only Providers
 * that declare [ProviderCapability.BARCODE_LOOKUP], and this one never joins.
 *
 * The corpus is seeded by Flyway rather than fetched, so the search itself is
 * [com.tucker.persistence.ReferenceFoodRepository]'s. What this bean carries is the
 * *fact of the source*: that AFCD is one, and what it can be asked.
 */
@Component
class AfcdNutritionProvider : NutritionProvider {

    override val capabilities: Set<ProviderCapability> = setOf(ProviderCapability.TEXT_SEARCH)

    /**
     * Never reached: the chain filters on [ProviderCapability.BARCODE_LOOKUP] and
     * this Provider declares none. Answering [ProviderLookup.Missing] rather than
     * throwing keeps the port's promise if that filter ever regresses — AFCD really
     * has never heard of any barcode, so a miss is the true verdict, where a throw
     * would be read as *no answer* and turn every scan Inconclusive.
     */
    override fun lookupByBarcode(barcode: String): ProviderLookup = ProviderLookup.Missing
}
