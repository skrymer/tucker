package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertEquals

class ProfileTest {

    private fun profileWith(
        timezone: String = "Europe/Copenhagen",
        reminderHour: Int = 8,
    ) = Profile(
        sex = Sex.MALE,
        birthDate = LocalDate.of(1986, 5, 22),
        heightCm = 180.0,
        timezone = timezone,
        reminderHour = reminderHour,
        remindersEnabled = true,
    )

    @Test
    fun `rejects a reminder hour outside the 0 to 23 day`() {
        val ex = assertThrows<IllegalArgumentException> { profileWith(reminderHour = 24) }
        assert(ex.message!!.contains("reminderHour", ignoreCase = true)) {
            "expected message to mention reminderHour, was '${ex.message}'"
        }
    }

    @Test
    fun `accepts midnight and the last hour of the day as reminder hours`() {
        assertEquals(0, profileWith(reminderHour = 0).reminderHour)
        assertEquals(23, profileWith(reminderHour = 23).reminderHour)
    }

    @Test
    fun `rejects a timezone that is not a known IANA zone`() {
        val ex = assertThrows<IllegalArgumentException> { profileWith(timezone = "Mars/Olympus") }
        assert(ex.message!!.contains("timezone", ignoreCase = true)) {
            "expected message to mention timezone, was '${ex.message}'"
        }
    }

    @Test
    fun `accepts a known IANA zone`() {
        assertEquals("Europe/Copenhagen", profileWith(timezone = "Europe/Copenhagen").timezone)
    }
}
