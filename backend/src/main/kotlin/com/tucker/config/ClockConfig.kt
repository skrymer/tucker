package com.tucker.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

/**
 * The single source of the server's wall clock.
 *
 * Server-side "now" is a deliberately narrow concern (ADR 0014, "the client owns
 * today"): the server never stamps a *domain* date on its own clock — those come
 * from the client's local date. A day is read from this [Clock] only through
 * [com.tucker.api.UserToday] (ADR 0014 names its uses) and by the reminder cron
 * (#82), which applies the user's Profile zone to its instant. An instant that is
 * not a date — a rolling window, a cache entry's age, when an event was recorded —
 * reads it directly. Defaulting to UTC keeps that behaviour deterministic and
 * matches the smoke-stack UTC pin (#84).
 *
 * The one seam both this work and #82 share rather than each inventing one.
 * [com.tucker.api.UserToday]'s tests run on a fixed clock; the cron's hand its tick
 * the instant to judge.
 */
@Configuration
class ClockConfig {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}
