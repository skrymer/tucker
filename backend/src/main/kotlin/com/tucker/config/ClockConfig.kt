package com.tucker.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.time.Clock

/**
 * The single source of the server's wall clock.
 *
 * Server-side "now" is a deliberately narrow concern (ADR 0014, "the client owns
 * today"): the server never stamps a *domain* date on its own clock — those come
 * from the client's local date. The injected [Clock] is read only where the
 * server legitimately needs its own instant: validating a client-supplied date is
 * plausible (see [com.tucker.api.UserToday]) and the future reminder cron (#82),
 * which applies the user's Profile zone to this instant itself. Defaulting to UTC
 * keeps that behaviour deterministic and matches the smoke-stack UTC pin (#84).
 *
 * Tests and the `smoke` profile can replace this bean with a fixed clock to freeze
 * time — the one seam both this work and #82 share rather than each inventing one.
 */
@Configuration
class ClockConfig {
    @Bean
    fun clock(): Clock = Clock.systemUTC()
}
