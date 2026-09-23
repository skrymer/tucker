package com.tucker.domain

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/**
 * A Tag's name: the User's own word, kept as they spelled it, and one Tag whatever
 * the case it is typed in (CONTEXT.md, **Tag**; ADR 0033).
 */
class TagNameTest {

    @Test
    fun `a Tag name is trimmed of surrounding whitespace`() {
        assertEquals("breakfast", TagName("  breakfast \t").value)
    }

    @Test
    fun `a Tag name of whitespace alone is refused`() {
        assertFailsWith<IllegalArgumentException> { TagName(" \t ") }
    }

    @Test
    fun `a Tag name longer than thirty characters is refused`() {
        assertFailsWith<IllegalArgumentException> { TagName("a".repeat(31)) }
    }

    @Test
    fun `an accented Tag name in another case is the same name`() {
        assertEquals(TagName("crème brûlée"), TagName("CRÈME BRÛLÉE"))
    }

    @Test
    fun `a Tag name of exactly thirty characters, once trimmed, is kept`() {
        assertEquals("a".repeat(30), TagName("  " + "a".repeat(30) + "  ").value)
    }

    @Test
    fun `two Tag names differing only in case are the same name, each keeping its spelling`() {
        val typed = TagName("Breakfast")
        val existing = TagName("breakfast")

        assertEquals(existing, typed)
        assertEquals(existing.hashCode(), typed.hashCode())
        assertEquals("Breakfast", typed.value)
    }
}
