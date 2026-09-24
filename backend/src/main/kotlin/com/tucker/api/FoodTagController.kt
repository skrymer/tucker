package com.tucker.api

import com.tucker.service.FoodService
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

/** Exactly which Tags a Food should carry, by id. */
data class SetFoodTagsRequest(val tagIds: List<Long>)

@RestController
class FoodTagController(
    private val foodService: FoodService,
    private val describer: FoodDescriber,
) {

    /**
     * Put exactly [SetFoodTagsRequest.tagIds] on [id] (ADR 0033). Ids only: a new Tag is
     * created by `POST /api/tags` first, so there is one way to name a Tag, not two.
     *
     * A Food or Tag that is not the caller's answers 404 exactly as an absent one does,
     * with nothing written.
     */
    @PutMapping("/api/foods/{id}/tags")
    fun retag(@PathVariable id: Long, @RequestBody request: SetFoodTagsRequest): FoodResponse {
        val retagged = foodService.retag(id, request.tagIds)
            ?: throw NotFoundException("no Food with id $id, or no Tag among ${request.tagIds}")
        return describer.describe(retagged)
    }
}
