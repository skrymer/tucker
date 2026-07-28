package com.tucker.domain

import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ReminderPolicyTest {

    private val now = Instant.parse("2026-06-10T09:00:00Z")
    private val today = LocalDate.of(2026, 6, 10)

    /**
     * A state where every gate is satisfied: reminders on, set up, subscribed, it
     * is 09:00 in the user's zone (their reminder hour), the latest review is eight
     * days old (overdue), the user has not opened the app today, and no reminder has
     * gone out for this episode. Each test flips exactly one field to prove that
     * gate is decisive.
     */
    private fun eligible() = ReminderState(
        now = now,
        zone = ZoneOffset.UTC,
        reminderHour = 9,
        remindersEnabled = true,
        setupComplete = true,
        hasSubscription = true,
        latestReviewOn = today.minusDays(8),
        lastSeenOn = today.minusDays(1),
        lastReminderSentOn = null,
    )

    @Test
    fun `sends when overdue, absent today, at the local reminder hour`() {
        assertTrue(ReminderPolicy.shouldSend(eligible()))
    }

    @Test
    fun `does not send when reminders are disabled`() {
        assertFalse(ReminderPolicy.shouldSend(eligible().copy(remindersEnabled = false)))
    }

    @Test
    fun `does not send before setup is complete`() {
        assertFalse(ReminderPolicy.shouldSend(eligible().copy(setupComplete = false)))
    }

    @Test
    fun `does not send when no device is subscribed`() {
        assertFalse(ReminderPolicy.shouldSend(eligible().copy(hasSubscription = false)))
    }

    @Test
    fun `does not send before the reminder hour`() {
        // It is 09:00 in the user's zone but they asked to be nudged at 10:00.
        assertFalse(ReminderPolicy.shouldSend(eligible().copy(reminderHour = 10)))
    }

    @Test
    fun `does not send once the reminder hour is well past`() {
        // 09:00 in the user's zone, and they asked for 07:00. Reaching the hour has to
        // stay a short window rather than the rest of the day, or a nudge owed since
        // morning arrives at bedtime — which is not what picking an hour asked for.
        assertFalse(ReminderPolicy.shouldSend(eligible().copy(reminderHour = 7)))
    }

    @Test
    fun `does not send when the latest review is not yet overdue`() {
        assertFalse(ReminderPolicy.shouldSend(eligible().copy(latestReviewOn = today.minusDays(6))))
    }

    @Test
    fun `does not send when the user has already opened the app today`() {
        assertFalse(ReminderPolicy.shouldSend(eligible().copy(lastSeenOn = today)))
    }

    @Test
    fun `does not send twice in the same overdue episode`() {
        // A reminder already went out yesterday, after the eight-day-old review —
        // the episode is already nudged, so a later tick stays quiet.
        val alreadyNudged = eligible().copy(lastReminderSentOn = today.minusDays(1))
        assertFalse(ReminderPolicy.shouldSend(alreadyNudged))
    }

    @Test
    fun `sends the first reminder when the user has never run a review`() {
        // No review yet (a fresh, set-up, never-opened user) is itself overdue.
        assertTrue(ReminderPolicy.shouldSend(eligible().copy(latestReviewOn = null)))
    }

    @Test
    fun `does not send twice before the first review exists`() {
        // No review has ever run, but a reminder already went out: the bootstrap
        // episode is already nudged. Without a review to move past, the dedupe must
        // still hold or the user is nudged every day forever.
        val alreadyNudgedNoReview = eligible().copy(
            latestReviewOn = null,
            lastReminderSentOn = today.minusDays(1),
        )
        assertFalse(ReminderPolicy.shouldSend(alreadyNudgedNoReview))
    }

    @Test
    fun `sends again once a fresh review opens a new overdue episode`() {
        // The user opened the app (a new review on day-7) after the last nudge
        // (day-9), so the new episode is eligible again.
        val reArmed = eligible().copy(
            latestReviewOn = today.minusDays(7),
            lastReminderSentOn = today.minusDays(9),
        )
        assertTrue(ReminderPolicy.shouldSend(reArmed))
    }

    @Test
    fun `still nudges on a day whose reminder hour the clocks skipped`() {
        val newYork = ZoneId.of("America/New_York")
        val springForward = LocalDate.of(2026, 3, 8)
        // The premise: on the spring-forward Sunday New York goes 01:59:59 straight to
        // 03:00, so no instant at all reads as 02:00 there. A user who asked to be
        // nudged at 02:00 must not lose the week's reminder to that gap.
        assertTrue(newYork.rules.getValidOffsets(springForward.atTime(2, 0)).isEmpty())

        val skippedHour = eligible().copy(
            now = Instant.parse("2026-03-08T07:00:00Z"), // 03:00, the first hour after the jump
            zone = newYork,
            reminderHour = 2,
            latestReviewOn = springForward.minusDays(8),
            lastSeenOn = springForward.minusDays(1),
        )
        assertTrue(ReminderPolicy.shouldSend(skippedHour))
    }

    @Test
    fun `sends again when the two dates were measured by clocks a day apart`() {
        // The send is stamped in the Profile's timezone; the review is dated by the
        // client's own day (ADR 0014). Those are the same clock only while the Profile
        // is current — a user who travels and never re-saves their reminder settings
        // can have the nudge recorded on the day *after* the review it produced. Real
        // episodes are seven days apart, so a single day of disagreement must not read
        // as "a later episode": nothing would ever clear it, because only the send can
        // move one side and only an app-open the other, and this is what suppresses
        // the nudge that would cause the app-open.
        val clocksDisagree = eligible().copy(
            latestReviewOn = today.minusDays(8),
            lastReminderSentOn = today.minusDays(7),
        )

        assertTrue(ReminderPolicy.shouldSend(clocksDisagree))
    }

    @Test
    fun `sends again when the last nudge went out on the review's own day`() {
        // The nudge that closed the previous episode is what brought the user back, so
        // it lands on the same local day as the review their return then wrote. That
        // send belongs to the episode just closed, not the one now owed — "after the
        // review" has to mean strictly after, or every episode a returning user
        // triggers is swallowed by the nudge that ended the last one.
        val nudgedOnTheReviewDay = eligible().copy(lastReminderSentOn = today.minusDays(8))

        assertTrue(ReminderPolicy.shouldSend(nudgedOnTheReviewDay))
    }

    @Test
    fun `judges the reminder hour in the user's timezone, not UTC`() {
        // 09:00Z is 11:00 in Copenhagen (UTC+2 in June) — a user who picked 11:00
        // is in their reminder hour now, even though it is not 11:00 UTC.
        val copenhagen = eligible().copy(zone = ZoneId.of("Europe/Copenhagen"), reminderHour = 11)
        assertTrue(ReminderPolicy.shouldSend(copenhagen))
    }
}
