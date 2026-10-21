package com.tucker.persistence

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

/** A Boolean column as SQLite holds it: 0 or 1, read back as set unless 0. */
class FlagsTest {

    @Test
    fun `stores true as 1 and false as 0`() {
        assertEquals(listOf(1, 0), listOf(true.toFlag(), false.toFlag()))
    }

    @Test
    fun `reads 0 as unset and 1 as set`() {
        assertEquals(listOf(false, true), listOf(0.isFlagSet(), 1.isFlagSet()))
    }
}
