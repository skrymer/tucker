package com.tucker.domain

import java.util.Locale

class TagName(given: String) {
    val value: String = given.trim()

    init {
        require(value.isNotEmpty()) { "a Tag name must not be blank" }
        require(value.length <= MAX_LENGTH) { "a Tag name must be at most $MAX_LENGTH characters" }
    }

    private val folded: String get() = value.lowercase(Locale.ROOT)

    override fun equals(other: Any?): Boolean = other is TagName && other.folded == folded

    override fun hashCode(): Int = folded.hashCode()

    override fun toString(): String = value

    companion object {
        const val MAX_LENGTH = 30
    }
}

/**
 * A named grouping a User keeps of their own Foods (CONTEXT.md, **Tag**). A thing in
 * its own right rather than a word on a Food, so it outlives the last Food wearing it.
 */
data class Tag(val id: Long?, val name: TagName)
