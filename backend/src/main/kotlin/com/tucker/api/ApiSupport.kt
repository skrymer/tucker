package com.tucker.api

import com.tucker.domain.Entry
import com.tucker.domain.Food
import com.tucker.domain.WeighedEntry
import com.tucker.persistence.FoodRepository

/**
 * The id of an entity that has already been persisted — loading from or saving to
 * the database always sets it. A null here is a bug, not a client error.
 */
internal fun persistedId(id: Long?): Long =
    id ?: error("a persisted entity is missing its id")

/**
 * The catalog and every Provider were asked about [barcode], and none knew it.
 * Shared by every surface a scan can land on, so the miss/no-answer split is made
 * once rather than per endpoint — see [providersUnreachable] for its counterpart.
 */
internal fun barcodeNotFound(barcode: String) =
    NotFoundException("no Food or Provider match for barcode $barcode")

/**
 * No Provider could answer for [barcode], so nothing was learned about it. The
 * peer of [barcodeNotFound], and deliberately not the same response: this one says
 * *we could not find out*, which is advice to try again, where a 404 is advice to
 * give up (issue #164).
 */
internal fun providersUnreachable(barcode: String) =
    ServiceUnavailableException("could not reach a nutrition source for barcode $barcode")

/**
 * Every Food the weighed Entries ate, resolved in one query. Shared by the
 * surfaces that reach past an Entry to the Food behind it, so "one query, not one
 * per Entry" is stated once. An Entry's Food always exists — deleting a
 * referenced Food is refused — so a lookup that misses is a bug, and the caller
 * decides how loud.
 */
internal fun FoodRepository.foodsOf(entries: List<Entry>): Map<Long, Food> =
    findByIds(entries.filterIsInstance<WeighedEntry>().map { it.foodId }.distinct())
        .associateBy { persistedId(it.id) }

/** [foodsOf] narrowed to what most callers want: the name to print beside an Entry. */
internal fun FoodRepository.namesOf(entries: List<Entry>): Map<Long, String> =
    foodsOf(entries).mapValues { (_, food) -> food.name }
