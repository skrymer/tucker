package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class ProteinFloorTest {

    @Test
    fun `the protein floor is 2 grams per kg of trend weight`() {
        assertEquals(172.0, ProteinFloor.forTrendWeight(86.0), 1e-9)
    }
}
