package com.tucker.api

import com.tucker.domain.TagName
import com.tucker.persistence.TagRepository
import com.tucker.persistence.TagWithFoodCount
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** A **Tag** on the wire, with how many of the User's Foods carry it. */
data class TagResponse(val id: Long, val name: String, val foodCount: Int)

data class CreateTagRequest(val name: String)

@RestController
@RequestMapping("/api/tags")
class TagController(private val tags: TagRepository) {

    @GetMapping
    fun list(): List<TagResponse> = tags.findAllWithFoodCounts().map { it.toResponse() }

    /**
     * Create a Tag, or answer with the one the User already has under that name in any
     * case — its spelling winning — so a picker can create what a User types without a
     * duplicate ever being an error (ADR 0033).
     */
    @PostMapping
    fun create(@RequestBody request: CreateTagRequest): ResponseEntity<TagResponse> {
        val name = TagName(request.name)
        tags.findByName(name)?.let { return ResponseEntity.ok(it.toResponse()) }
        val created = TagWithFoodCount(tags.insert(name), foodCount = 0)
        return ResponseEntity.status(HttpStatus.CREATED).body(created.toResponse())
    }

    private fun TagWithFoodCount.toResponse() = TagResponse(persistedId(tag.id), tag.name.value, foodCount)
}
