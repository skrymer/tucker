package com.tucker.api

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Clock
import java.time.LocalDate
import java.time.ZoneOffset
import kotlin.test.assertEquals

class UserTodayTest {

    // Server clock frozen at noon on 2026-06-06 (UTC), so "today" is unambiguous.
    private val serverToday = LocalDate.of(2026, 6, 6)
    private val userToday = UserToday(
        Clock.fixed(serverToday.atTime(12, 0).toInstant(ZoneOffset.UTC), ZoneOffset.UTC),
    )

    @Test
    fun `falls back to the server date when the client supplies none`() {
        assertEquals(serverToday, userToday.resolve(null))
    }

    @Test
    fun `honours a client date the server clock disagrees with within a day`() {
        // The client has rolled past local midnight while the server (UTC) still
        // lags — a real timezone boundary. The client's date wins, not the server's.
        val clientAhead = serverToday.plusDays(1)
        assertEquals(clientAhead, userToday.resolve(clientAhead))
    }

    @Test
    fun `rejects a client date more than a day from the server clock`() {
        // No real timezone shifts the local date by more than a day, so this is a
        // bad client clock, not a boundary — reject it.
        assertThrows<IllegalArgumentException> {
            userToday.resolve(serverToday.plusDays(2))
        }
    }
}
