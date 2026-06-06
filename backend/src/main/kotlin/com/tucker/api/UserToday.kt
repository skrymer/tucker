package com.tucker.api

import org.springframework.stereotype.Component
import java.time.Clock
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.abs

/**
 * Resolves the user's local "today" — the date any write acts on (ADR 0014).
 *
 * The client owns "today": it supplies its own local date, which the server
 * honours rather than stamping its own wall clock. The server's clock is used
 * only as a *plausibility* guard — a real timezone shifts the local date by at
 * most a day, so a [clientToday] more than a day from the server's date is a
 * misconfigured (or untrustworthy) client clock, not a boundary, and is rejected.
 * When the client supplies nothing we fall back to the server's date.
 */
@Component
class UserToday(private val clock: Clock) {
    fun resolve(clientToday: LocalDate?): LocalDate {
        val serverToday = LocalDate.now(clock)
        if (clientToday == null) return serverToday
        require(abs(ChronoUnit.DAYS.between(serverToday, clientToday)) <= 1) {
            "clientToday $clientToday is implausible relative to the server date ($serverToday)"
        }
        return clientToday
    }
}
