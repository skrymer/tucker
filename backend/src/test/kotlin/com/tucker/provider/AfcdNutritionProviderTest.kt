package com.tucker.provider

import com.tucker.domain.ProviderCapability
import com.tucker.domain.ProviderLookup
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

/**
 * The Australian Food Composition Database as a **Nutrition Provider** — the
 * `TEXT_SEARCH` capability ADR 0006 defined and left a seam for, finally filled.
 *
 * AFCD is the mirror image of a barcode source: rich micronutrient detail on
 * *generic* foods, and no barcodes at all (ADR 0027). What keeps it out of a scan
 * is the capability it declares; that the chain honours a declaration is
 * `BarcodeLookupService`'s own rule and is specified with its other rules.
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
    fun `AFCD asked for a barcode anyway says it has nothing, rather than throwing`() {
        assertEquals(
            ProviderLookup.Missing,
            AfcdNutritionProvider().lookupByBarcode("9310072011691"),
            "a Provider never throws (ADR 0006) — and a miss rather than an Inconclusive " +
                "Lookup, because a source that holds no barcodes is not a source that is " +
                "having a bad day, so there is nothing for a retry to fix",
        )
    }
}
