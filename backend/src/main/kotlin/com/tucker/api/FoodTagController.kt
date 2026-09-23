package com.tucker.api

import com.tucker.persistence.FoodRepository
import com.tucker.persistence.TagRepository
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

/** Exactly which Tags a Food should wear, by id. */
data class SetFoodTagsRequest(val tagIds: List<Long>)

@RestController
class FoodTagController(
    private val foods: FoodRepository,
    private val tags: TagRepository,
    private val describer: FoodDescriber,
) {

    /**
     * Put exactly [SetFoodTagsRequest.tagIds] on [id] (ADR 0033). Ids only: a new Tag is
     * created by `POST /api/tags` first, so there is one way to name a Tag, not two.
     *
     * A Tag id that is not the caller's answers 404 exactly as an absent one does, and
     * before anything is written, so a half-applied set is never left behind.
     */
    @PutMapping("/api/foods/{id}/tags")
    fun retag(@PathVariable id: Long, @RequestBody request: SetFoodTagsRequest): FoodResponse {
        requireOwned(request.tagIds)
        val retagged = foods.findById(id)?.let { foods.update(it.retagged(request.tagIds)) }
            ?: throw NotFoundException("no Food with id $id")
        return describer.describe(retagged)
    }

    private fun requireOwned(tagIds: List<Long>) {
        val owned = tags.findByIds(tagIds).mapNotNull { it.id }.toSet()
        tagIds.firstOrNull { it !in owned }?.let { throw NotFoundException("no Tag with id $it") }
    }
}
