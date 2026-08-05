package com.tucker.service

import com.tucker.persistence.UserRepository
import com.tucker.security.runAs
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
 * One User's turn cannot end another's: eligibility is decided per User, so
 * somebody who opened Tucker this morning simply contributes nothing while the
 * person who has not been seen for a week is still nudged.
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
        TickResult(sent = users.findAll().sumOf { user -> runAs(user) { reminder.nudgeIfDue(now) } })
}
