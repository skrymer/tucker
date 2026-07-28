package com.tucker.domain

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Everything the [ReminderPolicy] decision reads, gathered at one tick. The
 * server's [now] and the user's [zone] are passed in (never read from the wall
 * clock here) so the decision is pure and deterministic; they resolve into the
 * [today] and [localHour] the gates actually judge against.
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
    /** The user's local day the last reminder went out on — see [ReminderPolicy]. */
    val lastReminderSentOn: LocalDate?,
) {
    private val localNow get() = now.atZone(zone)

    /** The user's local day at [now] — what "today" means to every gate below. */
    val today: LocalDate get() = localNow.toLocalDate()

    val localHour: Int get() = localNow.hour
}

/**
 * The pure decision behind the Weekly-Review Reminder (ADR 0010): whether this
 * tick should push a nudge. It computes nothing about the review itself — it only
 * reads state and answers yes/no. See [ReminderState] for the inputs.
 */
object ReminderPolicy {

    /** Whether a reminder should be sent for [state] this tick. */
    fun shouldSend(state: ReminderState): Boolean =
        state.remindersEnabled &&
            state.setupComplete &&
            state.hasSubscription &&
            hasReachedReminderHour(state.localHour, state.reminderHour) &&
            ReviewCadence.isOverdue(state.latestReviewOn, state.today) &&
            absentToday(state.lastSeenOn, state.today) &&
            !alreadyNudged(state.lastReminderSentOn, state.latestReviewOn)

    /**
     * The user's local day has *reached* the hour they chose — and has not left it
     * far behind. An equality gate assumes every wall-clock hour occurs, and on a
     * spring-forward day one does not: New York goes 01:59:59 straight to 03:00, so a
     * user who asked for 02:00 would lose that week's nudge entirely.
     *
     * So the gate spans [REMINDER_WINDOW_HOURS] hours rather than one, which is the
     * smallest widening that survives a skipped hour — clocks never jump by more than
     * one. Keeping it *small* is the other half: an open-ended "any time after"
     * would let a nudge owed since breakfast land at 23:00, and picking an hour is
     * exactly a request for that not to happen. The second hour also buys one retry
     * of a failed delivery without waiting a day, which is as much retrying as is
     * worth doing — each attempt is a fresh connection the transport may leak
     * ([com.tucker.persistence.MartijndwarsWebPushSender]).
     */
    private fun hasReachedReminderHour(localHour: Int, reminderHour: Int): Boolean =
        (localHour - reminderHour) in 0 until REMINDER_WINDOW_HOURS

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
     *
     * "After" allows a day of slack, because the two dates are not read off the same
     * clock: the send is stamped in the `Profile`'s timezone, while the review is
     * dated by the client's own day (ADR 0014), and the two disagree whenever a
     * travelling user hasn't re-saved their reminder settings. Real episodes are
     * [ReviewCadence.REVIEW_CADENCE_DAYS] apart, so spending one of those days on
     * tolerance costs nothing — while getting it wrong is unrecoverable: a send that
     * reads as later than the review it produced suppresses every episode after it,
     * and the only thing that could clear it is the user returning unprompted, which
     * is precisely who this reminder exists to reach.
     */
    private fun alreadyNudged(lastReminderSentOn: LocalDate?, latestReviewOn: LocalDate?): Boolean {
        if (lastReminderSentOn == null) return false
        return latestReviewOn == null || lastReminderSentOn.isAfter(latestReviewOn.plusDays(CLOCK_SKEW_DAYS))
    }

    /**
     * How far the send day and the review date may disagree while still describing the
     * same moment — one day, the most two local calendars can ever differ by.
     */
    private const val CLOCK_SKEW_DAYS = 1L

    /** How many local hours from the reminder hour a nudge may still go out in. */
    private const val REMINDER_WINDOW_HOURS = 2
}
