package com.tucker.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Everything the [ReminderPolicy] decision reads, gathered at one tick. The
 * server's [now] and the user's [zone] are passed in (never read from the wall
 * clock here) so the decision is pure and deterministic; the policy derives the
 * user's local day and hour from them itself.
 */
data class ReminderState(
    val now: Instant,
    val zone: ZoneId,
    val reminderHour: Int,
    val remindersEnabled: Boolean,
    val setupComplete: Boolean,
    val hasSubscription: Boolean,
    val latestReviewOn: LocalDate?,
    val lastSeenOn: LocalDate?,
    val lastReminderSentAt: Instant?,
)

/**
 * The pure decision behind the Weekly-Review Reminder (ADR 0010): whether this
 * tick should push a nudge. It computes nothing about the review itself — it only
 * reads state and answers yes/no. See [ReminderState] for the inputs.
 */
object ReminderPolicy {

    /** Whether a reminder should be sent for [state] this tick. */
    fun shouldSend(state: ReminderState): Boolean {
        val localNow = state.now.atZone(state.zone)
        val today = localNow.toLocalDate()
        return state.remindersEnabled &&
            state.setupComplete &&
            state.hasSubscription &&
            localNow.hour == state.reminderHour &&
            ReviewCadence.isOverdue(state.latestReviewOn, today) &&
            absentToday(state.lastSeenOn, today) &&
            !alreadyNudged(state.lastReminderSentAt, state.latestReviewOn, state.zone)
    }

    /** The user hasn't opened the app yet on their local [today]. */
    private fun absentToday(lastSeenOn: LocalDate?, today: LocalDate): Boolean =
        lastSeenOn == null || lastSeenOn.isBefore(today)

    /**
     * A reminder already went out for the current overdue episode (ADR 0010 dedupe):
     * suppress when one was sent *after* the latest review's date. Before the first
     * review ever runs there is no date to be after, so any prior send still counts
     * as nudged — otherwise a set-up, never-opened user would be nudged every day,
     * since the reminder writes no review. Opening the app writes a fresh review whose
     * date moves past the last send, which re-arms the next episode.
     */
    private fun alreadyNudged(lastReminderSentAt: Instant?, latestReviewOn: LocalDate?, zone: ZoneId): Boolean {
        if (lastReminderSentAt == null) return false
        return latestReviewOn == null || lastReminderSentAt.atZone(zone).toLocalDate().isAfter(latestReviewOn)
    }
}
