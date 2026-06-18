package com.tucker.service

import com.tucker.persistence.EntryRepository
import com.tucker.persistence.FoodRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * Application logic for Foods — the cross-aggregate rules that span the Food
 * catalog and the Entry history (ADR 0001: cross-aggregate logic lives in a thin
 * service, not the controller).
 */
@Service
class FoodService(
    private val foods: FoodRepository,
    private val entries: EntryRepository,
) {

    /**
     * Remove a Food from the catalog, enforcing that a Food referenced by at least
     * one Entry **cannot be deleted** — Entries are permanent history (CONTEXT.md,
     * Food). The rule is a deterministic existence check (not a caught FK
     * violation); a referenced Food is rejected with an [IllegalArgumentException]
     * naming it, which the API layer maps to a 400. Deleting an absent Food is an
     * idempotent no-op.
     */
    @Transactional
    fun delete(id: Long) {
        val food = foods.findById(id) ?: return
        require(!entries.referencesFood(id)) {
            "${food.name} has logged Entries and can't be deleted."
        }
        foods.delete(id)
    }
}
