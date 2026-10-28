package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

class AlcoholByVolumeTest {

    @Test
    fun `a 13 percent wine carries 10,257 g of alcohol per 100 g`() {
        // 13 * 0.789, the drink taken as 1 g/ml (ADR 0040)
        assertEquals(10.257, AlcoholByVolume(13.0).gramsPer100g, 1e-9)
    }

    @Test
    fun `the grams a 13 percent wine is stored as read back as exactly 13 percent`() {
        // 10.257 / 0.789 is 12.999999999999998 in floating point; the reopened form must not show that.
        val stored = AlcoholByVolume(13.0).gramsPer100g

        assertEquals(13.0, AlcoholByVolume.percentOf(stored))
    }

    @Test
    fun `grams past what any drink holds still read back as an ABV, a Recipe conserving its alcohol`() {
        // 154 g /100g: a bottle of 13% wine's 77 g of alcohol cooked down to 50 g (ADR 0040).
        assertEquals(195.183777, AlcoholByVolume.percentOf(154.0), 1e-9)
    }

    @Test
    fun `an ABV below 0 is refused`() {
        assertThrows<IllegalArgumentException> { AlcoholByVolume(-0.1) }
    }

    @Test
    fun `pure alcohol, exactly 100 percent, is accepted`() {
        assertEquals(78.9, AlcoholByVolume(100.0).gramsPer100g, 1e-9)
    }

    @Test
    fun `an ABV above 100 is refused`() {
        assertThrows<IllegalArgumentException> { AlcoholByVolume(100.1) }
    }
}
