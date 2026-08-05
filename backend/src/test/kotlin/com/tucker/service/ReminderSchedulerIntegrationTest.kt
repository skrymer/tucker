package com.tucker.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.tucker.domain.Maintenance
import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.domain.WeeklyReview
import com.tucker.domain.WeightMeasurement
import com.tucker.domain.User
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.PushSubscriptionRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.UserRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import com.tucker.security.AccessTokens
import com.tucker.security.runAs
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Drives the [ReminderScheduler] glue end-to-end against real repositories, with
 * the web-push transport faked at its true external boundary (ADR 0013). The fake
 * reports a subscription whose endpoint contains "gone" as 410 GONE, everything
 * else delivered, and records the endpoints it was asked to push to.
 *
 * One test also drives the real summary endpoint (hence MockMvc): the rule it pins —
 * opening Tucker advances the weekly cadence, so no reminder is owed — lives only at
 * that seam and is invisible from either side alone.
 *
 * Deliberately **not** `@WithTuckerUser`. The whole question this class answers is
 * whether the scheduler can act on somebody's behalf with no request behind it, and an
 * ambient identity handed to the test thread would be inherited by `runTick` — every
 * test here would then pass whether or not the impersonation works. So the thread stays
 * anonymous, and the seeding says whose data it is by wrapping [runAs] explicitly.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReminderSchedulerIntegrationTest {

    @TestConfiguration
    class FakeSenderConfig {
        @Bean
        @Primary
        fun recordingSender() = RecordingTestSender()
    }

    class RecordingTestSender : WebPushSender {
        val sentEndpoints = mutableListOf<String>()
        val sentPayloads = mutableListOf<String>()
        override fun send(subscription: PushSubscription, payload: String): SendResult {
            sentEndpoints += subscription.endpoint
            sentPayloads += payload
            return if ("gone" in subscription.endpoint) SendResult.GONE else SendResult.DELIVERED
        }
    }

    @Autowired lateinit var objectMapper: ObjectMapper
    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var scheduler: ReminderScheduler
    @Autowired lateinit var profiles: ProfileRepository
    @Autowired lateinit var weights: WeightMeasurementRepository
    @Autowired lateinit var reviews: WeeklyReviewRepository
    @Autowired lateinit var subscriptions: PushSubscriptionRepository
    @Autowired lateinit var reminderState: ReminderStateRepository
    @Autowired lateinit var users: UserRepository
    @Autowired lateinit var sender: RecordingTestSender

    private val now = Instant.parse("2026-06-10T09:00:00Z")
    private val today = LocalDate.of(2026, 6, 10)

    /**
     * The person the reminder is for. Provisioned under the address the MockMvc
     * requests authenticate as, so the one test that opens Tucker over HTTP is the
     * same person the scheduler then considers.
     */
    private lateinit var subscriber: User

    /**
     * The recorder is a context-wide singleton, so what one test pushed is still in
     * it when the next runs — @Transactional rolls back the database, not a bean.
     */
    @BeforeEach
    fun startFromSilence() {
        sender.sentEndpoints.clear()
        sender.sentPayloads.clear()
        subscriber = users.insertIfAbsent(User(id = null, email = AccessTokens.EMAIL))
    }

    /** Profile (reminders on, 09:00 UTC), a weight, an 8-day-old review, one device. */
    private fun seedEligible(
        endpoint: String = "https://push.example/device-a",
        reviewedDaysAgo: Long = 8,
    ) {
        profiles.save(
            Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0, "UTC", reminderHour = 9, remindersEnabled = true),
        )
        subscriptions.save(PushSubscription(null, endpoint, "BKey", "Auth", null))
        seedHistory(subscriber, reviewedDaysAgo)
    }

    /**
     * The owned half of a seed: a weigh-in, and a review [reviewedDaysAgo] old.
     *
     * Split out because the Profile and the Push Subscription above are still global
     * until slice 5 (#159), so a second User inherits them and needs only a history of
     * their own to be considered separately.
     */
    private fun seedHistory(user: User, reviewedDaysAgo: Long) = runAs(user) {
        weights.save(WeightMeasurement(null, today.minusDays(1), 86.0))
        reviews.insert(
            WeeklyReview(
                null, today.minusDays(reviewedDaysAgo), 86.0,
                Maintenance(2400.0, Maintenance.Basis.FORMULA_SEED), 1850.0, 172.0,
            ),
        )
    }

    @Test
    fun `sends to the subscribed device when a review is overdue and the user is absent`() {
        seedEligible(endpoint = "https://push.example/device-a")

        val result = scheduler.runTick(now)

        assertEquals(1, result.sent)
        assertEquals(listOf("https://push.example/device-a"), sender.sentEndpoints)
        // Stamped as the user's local day, which is what the dedupe compares.
        assertEquals(today, reminderState.lastReminderSentOn())
    }

    @Test
    fun `sends the nudge text alone, naming no screen for a tap to land on`() {
        seedEligible()

        scheduler.runTick(now)

        // Parsed rather than pattern-matched because that is how the service worker
        // reads it (`event.data.json()`), and PAYLOAD is hand-concatenated JSON.
        val payload = objectMapper.readTree(sender.sentPayloads.single())
        // Exactly what the worker renders, and nothing more: a route belongs to the
        // frontend's table beside the nav, and the backend's copy of one is what went
        // stale for months until a tap 404'd (issue #178).
        assertEquals(setOf("title", "body"), payload.fieldNames().asSequence().toSet())
        assertTrue(payload.path("title").asText().isNotBlank())
        assertTrue(payload.path("body").asText().isNotBlank())
    }

    @Test
    fun `owes no reminder once the user has opened Tucker, because that ran the due review`() {
        seedEligible()

        // One summary read — the dashboard and the Check tab are indistinguishable
        // here, and that is the decision, not an oversight (ADR 0010, issue #174).
        mockMvc.get("/api/summary") { param("date", "$today") }
            .andExpect { status { isOk() } }

        val result = scheduler.runTick(now)

        // Asserted by its cause, not merely by the silence: the review the reminder
        // would have nudged about has already run, dated today, so nothing is overdue.
        // Without this line a broken absent-today gate would look identical.
        assertEquals(today, runAs(subscriber) { reviews.latest()?.reviewedOn })
        assertEquals(0, result.sent)
        assertEquals(emptyList(), sender.sentEndpoints)
    }

    @Test
    fun `does not send a second time within the same overdue episode`() {
        seedEligible()

        val first = scheduler.runTick(now)
        // The next day, still 09:00, still away, still no fresh review. Only the
        // dedupe can keep this quiet — the hour gate passes on both ticks.
        val second = scheduler.runTick(Instant.parse("2026-06-11T09:00:00Z"))

        assertEquals(1, first.sent)
        assertEquals(0, second.sent)
    }

    @Test
    fun `does not nudge twice within the same day's window`() {
        seedEligible()

        val atNine = scheduler.runTick(now)
        // 10:00 is the second and last hour a nudge may go out in, so this tick clears
        // the hour gate on its own — only the dedupe can keep it quiet, which is the
        // property the widened gate leans on.
        val atTen = scheduler.runTick(Instant.parse("2026-06-10T10:00:00Z"))

        assertEquals(1, atNine.sent)
        assertEquals(0, atTen.sent)
        assertEquals(listOf("https://push.example/device-a"), sender.sentEndpoints)
    }

    @Test
    fun `stops trying once the day is well past the reminder hour`() {
        seedEligible()

        // Nothing has been delivered, so the dedupe is still open — the hour gate is
        // all that stands between an undelivered nudge and an attempt every hour until
        // midnight, each one a fresh connection to a push service that isn't answering.
        val lateInTheDay = listOf("2026-06-10T15:00:00Z", "2026-06-10T23:00:00Z")
            .map { scheduler.runTick(Instant.parse(it)).sent }

        assertEquals(listOf(0, 0), lateInTheDay)
        assertEquals(emptyList(), sender.sentEndpoints)
    }

    @Test
    fun `prunes a subscription the push service reports gone`() {
        seedEligible(endpoint = "https://push.example/device-good")
        subscriptions.save(PushSubscription(null, "https://push.example/device-gone", "BKey", "Auth", null))

        val result = scheduler.runTick(now)

        assertEquals(listOf("https://push.example/device-good"), subscriptions.findAll().map { it.endpoint })
        assertEquals(1, result.sent)
    }

    /**
     * That the tick gives *every* User a turn, rather than stopping at the first —
     * which is the whole of what the loop added, and all this can honestly claim.
     *
     * Deliberately **not** named for #159's "one User being up to date does not
     * suppress another's": slice 4 does not deliver that. It holds here only because
     * "up to date" is seeded as a recent review. Reach the same state the way a real
     * User does — by opening Tucker — and the shared last-seen stamp silences the
     * overdue User too, because `reminder_state` is still global. Same for the device
     * the nudge lands on below: subscriptions are global, so it is the only one there
     * is. Both become per-User in slice 5 (see [UserReminder]).
     */
    @Test
    fun `every User gets a turn, so a quiet first one does not end the tick`() {
        // The subscriber reviewed today, so nothing is owed on their turn.
        seedEligible(reviewedDaysAgo = 0)
        // Somebody else, later by id, has not reviewed for over a week. A loop that
        // stopped at the first User would leave them un-nudged and say nothing.
        seedHistory(users.insertIfAbsent(User(id = null, email = "overdue@tucker.invalid")), reviewedDaysAgo = 8)

        val result = scheduler.runTick(now)

        assertEquals(1, result.sent)
        assertEquals(listOf("https://push.example/device-a"), sender.sentEndpoints)
    }

    /**
     * The premise every test in this class rests on, asserted rather than assumed.
     *
     * The cron thread has no identity, so `runTick` must establish one per User. If
     * an identity were ambient here — leaked in by another class, or left behind by
     * [runAs] failing to restore — then `runTick` would read *that* User's data and
     * every test above would pass with the impersonation deleted entirely.
     */
    @Test
    fun `the tick runs on a thread with nobody signed in`() {
        seedEligible()

        assertNull(
            SecurityContextHolder.getContext().authentication,
            "seeding through runAs must leave the test thread anonymous, or this class " +
                "proves nothing about the scheduler establishing its own context",
        )

        assertEquals(1, scheduler.runTick(now).sent)
    }

    @Test
    fun `stays quiet before the user's reminder hour`() {
        seedEligible()

        // 08:00 UTC, but the user asked for 09:00 — the scheduler must feed this
        // instant to the policy, which gates it out.
        val result = scheduler.runTick(Instant.parse("2026-06-10T08:00:00Z"))

        assertEquals(0, result.sent)
        assertEquals(emptyList(), sender.sentEndpoints)
    }
}
