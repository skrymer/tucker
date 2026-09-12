package com.tucker.domain

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.LocalDate
import kotlin.test.assertEquals

class ProfileTest {

    private val today = LocalDate.of(2026, 9, 10)

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

    /** Capture-time check of a Profile that varies only in [birthDate]. */
    private fun capturedWith(birthDate: LocalDate) =
        Profile(sex = Sex.MALE, birthDate = birthDate, heightCm = 180.0).capturedOn(today)

    @Test
    fun `rejects a height of zero`() {
        // Height is a multiplier in Mifflin-St Jeor, so a zero silently produces a
        // BMR — and therefore a Maintenance and a Calorie Budget — rather than failing.
        val ex = assertThrows<IllegalArgumentException> {
            Profile(sex = Sex.MALE, birthDate = LocalDate.of(1986, 5, 22), heightCm = 0.0)
        }
        assert(ex.message!!.contains("heightCm", ignoreCase = true)) {
            "expected message to mention heightCm, was '${ex.message}'"
        }
    }

    @Test
    fun `rejects a body weight of zero when computing BMR`() {
        val ex = assertThrows<IllegalArgumentException> {
            profileWith().basalMetabolicRateKcal(weightKg = 0.0, on = LocalDate.of(2026, 5, 22))
        }
        assert(ex.message!!.contains("weightKg", ignoreCase = true)) {
            "expected message to mention weightKg, was '${ex.message}'"
        }
    }

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

    @Test
    fun `capturedOn rejects a birth date of today`() {
        // Where the rule sits, exactly: the latest acceptable birth date is
        // yesterday, the same boundary the birth-date picker already pins.
        val ex = assertThrows<IllegalArgumentException> { capturedWith(today) }
        assert(ex.message!!.contains("birthDate", ignoreCase = true)) {
            "expected message to mention birthDate, was '${ex.message}'"
        }
    }

    @Test
    fun `capturedOn accepts a birth date of yesterday`() {
        val yesterday = today.minusDays(1)
        assertEquals(yesterday, capturedWith(yesterday).birthDate)
    }

    @Test
    fun `capturedOn rejects a birth date more than 120 years before today`() {
        // The mirror of a future birth date, and just as damaging: an age of 500
        // drives the Mifflin-St Jeor seed deeply negative instead of merely wrong.
        // The number is spelled out here because a mutation sweep can't reach a constant.
        val ex = assertThrows<IllegalArgumentException> {
            capturedWith(today.minusYears(120).minusDays(1))
        }
        assert(ex.message!!.contains("birthDate", ignoreCase = true)) {
            "expected message to mention birthDate, was '${ex.message}'"
        }
    }

    @Test
    fun `capturedOn accepts a birth date exactly 120 years before today`() {
        val hundredAndTwentieth = today.minusYears(120)
        assertEquals(hundredAndTwentieth, capturedWith(hundredAndTwentieth).birthDate)
    }
}
