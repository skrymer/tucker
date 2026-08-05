package com.tucker.service

import com.tucker.domain.PushSubscription
import com.tucker.domain.ReminderState
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.springframework.stereotype.Component
import java.time.Instant
import java.time.ZoneId

/**
 * Everything the pure [com.tucker.domain.ReminderPolicy] decision reads about the
 * current User, gathered in one place.
 *
 * Split out from [ReminderScheduler] because they are two jobs, and after F10 the
 * seam is where the scoping happens: every read below answers to whoever
 * [com.tucker.security.runAs] established, so the reminder sees exactly the history
 * that User's own dashboard would (ADR 0021).
 *
 * Thin glue rather than a deep module (ADR 0013): it composes four repositories and
 * decides nothing, so it is specified by `ReminderSchedulerIntegrationTest` driving
 * the whole tick rather than by a test of its own.
 */
@Component
class ReminderStateReader(
    private val profiles: ProfileRepository,
    private val weights: WeightMeasurementRepository,
    private val reviews: WeeklyReviewRepository,
    private val reminderState: ReminderStateRepository,
) {

    /**
     * The current User's reminder state as of [now], or null when they have no
     * Profile — without one there is no timezone to resolve a local hour in, and so
     * nothing the policy could decide.
     */
    fun stateFor(now: Instant, subs: List<PushSubscription>): ReminderState? {
        val profile = profiles.get() ?: return null
        return ReminderState(
            now = now,
            zone = ZoneId.of(profile.timezone),
            reminderHour = profile.reminderHour,
            remindersEnabled = profile.remindersEnabled,
            setupComplete = weights.latest() != null,
            hasSubscription = subs.isNotEmpty(),
            latestReviewOn = reviews.latest()?.reviewedOn,
            lastSeenOn = reminderState.lastSeenOn(),
            lastReminderSentOn = reminderState.lastReminderSentOn(),
        )
    }
}
