package com.tucker.domain

import kotlin.test.Test
import kotlin.test.assertEquals

/**
 * Renaming a Tag, which onto the name of another of the User's Tags, in any case,
 * merges the two instead (CONTEXT.md, **Tag**; ADR 0033).
 */
class TagRenameTest {

    private val breakfast = Tag(1, TagName("breakfast"))
    private val snack = Tag(2, TagName("Snack"))

    @Test
    fun `renaming a Tag to a name no other Tag has is a rename`() {
        val outcome = breakfast.renamedTo(TagName("morning"), owned = listOf(breakfast, snack))

        assertEquals(TagRename.Renamed(Tag(1, TagName("morning"))), outcome)
    }

    @Test
    fun `renaming a Tag onto another Tag's name in another case merges into that Tag as it is spelled`() {
        val outcome = breakfast.renamedTo(TagName("snack"), owned = listOf(breakfast, snack))

        assertEquals(TagRename.Merged(into = Tag(2, TagName("Snack"))), outcome)
        assertEquals("Snack", (outcome as TagRename.Merged).into.name.value)
    }

    @Test
    fun `respelling a Tag's own name in another case is a rename, not a merge into itself`() {
        val outcome = breakfast.renamedTo(TagName("Breakfast"), owned = listOf(breakfast, snack))

        assertEquals(TagRename.Renamed(Tag(1, TagName("Breakfast"))), outcome)
        assertEquals("Breakfast", (outcome as TagRename.Renamed).tag.name.value)
    }
}
