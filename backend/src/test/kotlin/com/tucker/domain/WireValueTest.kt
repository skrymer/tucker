package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class WireValueTest {

    private enum class Size(override val wire: String) : WireValue {
        SMALL("s"),
        LARGE("l"),
    }

    @Test
    fun `reads a constant by its wire spelling, not its name`() {
        assertEquals(Size.LARGE, wireValueOf<Size>("l", "a size"))
        assertFailsWith<IllegalArgumentException> { wireValueOf<Size>("LARGE", "a size") }
    }

    @Test
    fun `refuses any other spelling, naming what it is not`() {
        val refusal = assertFailsWith<IllegalArgumentException> { wireValueOf<Size>("m", "a size") }

        assertEquals("\"m\" is not a size", refusal.message)
    }
}
