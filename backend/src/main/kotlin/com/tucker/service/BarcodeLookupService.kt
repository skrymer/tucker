package com.tucker.service

import com.tucker.domain.BarcodeLookup
import com.tucker.domain.BarcodeLookupCache
import com.tucker.domain.NutritionProvider
import com.tucker.domain.ProviderCapability
import com.tucker.domain.ProviderLookup
import com.tucker.persistence.FoodRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service

/**
 * Resolves a barcode **catalog-first, then through the ordered Provider chain**
 * (ADR 0006). A catalog match returns the saved [com.tucker.domain.Food]; otherwise
 * each barcode-capable [NutritionProvider] is tried in order and the first match
 * wins. Coming up empty is discriminated, never `null`: see [askProviders].
 *
 * The order of trust is server-side policy, not something the UI decides
 * (ADR 0002). The Provider list is injected in bean order — the operator's
 * deployment config — and is **not** user-selectable.
 */
@Service
class BarcodeLookupService(
    private val foods: FoodRepository,
    private val providers: List<NutritionProvider>,
    private val cache: BarcodeLookupCache,
) {

    /** Resolve [barcode]; see the class doc for the resolution order. */
    fun lookup(barcode: String): BarcodeLookup {
        // Catalog first, then the shared per-barcode cache: a previously-seen
        // barcode resolves without re-hitting a Provider (ADR 0006). The cache
        // holds only Provider hits, so a transient miss never sticks.
        val alreadyKnown =
            foods.findByBarcode(barcode)?.let { BarcodeLookup.Existing(it) }
                ?: cache.get(barcode)?.let { BarcodeLookup.Candidate(it) }
        if (alreadyKnown != null) return alreadyKnown

        return askProviders(barcode)
    }

    /**
     * Walk the ordered chain. The first Provider that knows the product wins, and
     * a Provider that fails still yields to the next (ADR 0006) — but the chain
     * now *remembers* that it failed.
     *
     * Coming up empty is only a [BarcodeLookup.Missing] when every Provider
     * actually answered. If any could not, the lookup is
     * [BarcodeLookup.Inconclusive]: a healthy last-place Provider's "no" must not
     * speak for a first-place Provider that was never reached (issue #164). A
     * chain with no barcode-capable Provider at all is Missing, not Inconclusive —
     * nothing is broken, and retrying cannot help.
     */
    private fun askProviders(barcode: String): BarcodeLookup {
        var anySilent = false
        for (provider in providers.filter { ProviderCapability.BARCODE_LOOKUP in it.capabilities }) {
            when (val answer = ask(provider, barcode)) {
                // Returning here is the "first match wins" rule: no Provider after
                // this one is consulted.
                is ProviderLookup.Found -> {
                    cache.put(barcode, answer.candidate)
                    return BarcodeLookup.Candidate(answer.candidate)
                }
                ProviderLookup.Missing -> Unit
                ProviderLookup.Inconclusive -> anySilent = true
            }
        }
        return if (anySilent) BarcodeLookup.Inconclusive else BarcodeLookup.Missing
    }

    /**
     * Ask one Provider. The port promises never to throw, so this is a backstop
     * for an implementation that breaks that promise — and a broken Provider is
     * one that did not answer, never one that said "no".
     */
    private fun ask(provider: NutritionProvider, barcode: String): ProviderLookup =
        runCatching { provider.lookupByBarcode(barcode) }
            .onFailure {
                log.warn(
                    "Provider {} threw looking up barcode {}; treating it as no answer",
                    provider::class.simpleName, barcode, it,
                )
            }
            .getOrDefault(ProviderLookup.Inconclusive)

    private companion object {
        private val log = LoggerFactory.getLogger(BarcodeLookupService::class.java)
    }
}
