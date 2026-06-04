package com.tucker.service

import com.tucker.domain.BarcodeLookupCache
import com.tucker.domain.FoodCandidate
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * In-memory [BarcodeLookupCache] (ADR 0006, v1). A process-local map is enough at
 * single-user scale; the seam stays open for a persistent or shared-dataset
 * backing later. Each entry keeps the normalised candidate, its source (carried
 * on the [FoodCandidate]), and the **fetched-at** instant — the seam a future TTL
 * or eviction policy would read; v1 never expires an entry.
 *
 * The [Clock] is injected (defaulting to the system clock) so the fetched-at
 * stamp is deterministic under test.
 */
@Component
class InMemoryBarcodeLookupCache(
    private val clock: Clock = Clock.systemUTC(),
) : BarcodeLookupCache {

    private data class Entry(val candidate: FoodCandidate, val fetchedAt: Instant)

    private val store = ConcurrentHashMap<String, Entry>()

    override fun get(barcode: String): FoodCandidate? = store[barcode]?.candidate

    override fun put(barcode: String, candidate: FoodCandidate) {
        store[barcode] = Entry(candidate, clock.instant())
    }
}
