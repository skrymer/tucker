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
        lastReminderSentAt = null,
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
    fun `does not send outside the reminder hour`() {
        // It is 09:00 in the user's zone but they asked to be nudged at 10:00.
        assertFalse(ReminderPolicy.shouldSend(eligible().copy(reminderHour = 10)))
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
        val alreadyNudged = eligible().copy(
            lastReminderSentAt = Instant.parse("2026-06-09T09:00:00Z"),
        )
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
            lastReminderSentAt = Instant.parse("2026-06-09T09:00:00Z"),
        )
        assertFalse(ReminderPolicy.shouldSend(alreadyNudgedNoReview))
    }

    @Test
    fun `sends again once a fresh review opens a new overdue episode`() {
        // The user opened the app (a new review on day-7) after the last nudge
        // (day-9), so the new episode is eligible again.
        val reArmed = eligible().copy(
            latestReviewOn = today.minusDays(7),
            lastReminderSentAt = Instant.parse("2026-06-01T09:00:00Z"),
        )
        assertTrue(ReminderPolicy.shouldSend(reArmed))
    }

    @Test
    fun `judges the reminder hour in the user's timezone, not UTC`() {
        // 09:00Z is 11:00 in Copenhagen (UTC+2 in June) — a user who picked 11:00
        // is in their reminder hour now, even though it is not 11:00 UTC.
        val copenhagen = eligible().copy(zone = ZoneId.of("Europe/Copenhagen"), reminderHour = 11)
        assertTrue(ReminderPolicy.shouldSend(copenhagen))
    }
}
