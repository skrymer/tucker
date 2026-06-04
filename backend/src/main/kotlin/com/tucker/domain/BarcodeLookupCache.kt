package com.tucker.domain

/**
 * A **shared, per-barcode result cache** for Provider look-ups (ADR 0006). A
 * barcode→nutrition result is **user-independent** (the same product for
 * everyone), so the cache is keyed by barcode alone — no user, no Provider. It is
 * consulted **before** the Provider chain and populated **after** a Provider hit,
 * so a previously-seen barcode resolves without re-hitting a Provider. A miss is
 * never cached, so a transient lookup failure can't stick.
 *
 * The cache is the chosen lever over a rate limiter: load scales with *distinct
 * products scanned*, not users or scans.
 */
interface BarcodeLookupCache {
    /** The cached [FoodCandidate] for [barcode], or `null` if none is stored. */
    fun get(barcode: String): FoodCandidate?

    /** Record [candidate] for [barcode], with the time it was fetched. */
    fun put(barcode: String, candidate: FoodCandidate)
}
