package com.tucker.service

import com.tucker.domain.User
import com.tucker.persistence.UserRepository
import com.tucker.security.runAs
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Instant

/** The outcome of one reminder tick: how many devices a reminder was delivered to. */
data class TickResult(val sent: Int)

/**
 * Tucker's one scheduled action (ADR 0010), and the only place that knows the
 * Weekly-Review Reminder is a thing done for *several* people.
 *
 * That is the whole of its job. A cron thread has no request and therefore no
 * current User, but everything a reminder reads is scoped to one — so this gives
 * each User their own turn through [runAs] and lets [UserReminder] do the same
 * work it would do for a request (ADR 0021). Deciding whether to nudge, and
 * sending, live there; iterating lives here, and the two axes stay apart.
 *
 * One User's turn cannot end another's — neither by being ineligible nor by
 * failing. Eligibility is decided per User, and a turn that throws is logged and
 * contributes nothing rather than abandoning the rest of the tick: without that,
 * the blast radius of one bad row or one exhausted connection would depend on
 * where its owner happened to sort by id, and the lowest-id User failing would
 * cost everybody their nudge. A tick is hourly and deduped (ADR 0010), so the
 * right answer to a failure is to carry on and let the next tick retry.
 *
 * The hourly trigger is a separate, production-only bean.
 */
@Service
class ReminderScheduler(
    private val users: UserRepository,
    private val reminder: UserReminder,
) {

    /** Run one reminder tick as of [now], nudging whoever is due. */
    fun runTick(now: Instant): TickResult =
        TickResult(sent = users.findAll().sumOf { user -> nudgeOrCarryOn(user, now) })

    /**
     * One User's turn, isolated: their failure is theirs alone.
     *
     * The catch is broad on purpose, and the breadth *is* the requirement — the
     * point is that no failure of one User's turn may reach the next one, so
     * enumerating the failures would defeat it the first time an unlisted one
     * appeared. They have nothing in common to narrow to in any case: an exhausted
     * connection pool, a Profile whose stored timezone the JVM no longer knows, a
     * row predating an invariant its domain type now requires. `RuntimeException`
     * rather than `Throwable`, so a genuine `Error` — the transport rethrows one on
     * an unusable VAPID key — still takes the process down as it should.
     */
    @Suppress("TooGenericExceptionCaught")
    private fun nudgeOrCarryOn(user: User, now: Instant): Int =
        try {
            runAs(user) { reminder.nudgeIfDue(now) }
        } catch (e: RuntimeException) {
            // Named, because the whole point is knowing *whose* turn broke — and logged
            // rather than swallowed, since nothing else will ever report it.
            log.warn("Reminder tick failed for {}, continuing with the rest", user.email, e)
            0
        }

    private companion object {
        val log = LoggerFactory.getLogger(ReminderScheduler::class.java)
    }
}
