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
import com.tucker.security.ACCESS_ASSERTION_HEADER
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
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Drives the [ReminderScheduler] glue end-to-end against real repositories, with the
 * web-push transport faked at its true external boundary (ADR 0013). The fake reports a
 * subscription whose endpoint contains "gone" as 410 GONE, everything else delivered,
 * and records the endpoints it was asked to push to.
 *
 * Two tests also drive the real summary endpoint (hence MockMvc): the rule they pin —
 * opening Tucker advances the weekly cadence, so no reminder is owed — lives only at
 * that seam and is invisible from either side alone.
 *
 * Deliberately **not** `@WithTuckerUser`. The whole question this class answers is
 * whether the scheduler can act on somebody's behalf with no request behind it, and an
 * ambient identity handed to the test thread would be inherited by `runTick` — every
 * test here would then pass whether or not the impersonation works. So the thread stays
 * anonymous, and every seed and read-back says whose data it is by wrapping [runAs]
 * explicitly.
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

        /**
         * Blow up on the next send, once. The transport itself converts its own
         * failures to [SendResult.FAILED], so this stands in for the things that
         * genuinely do throw out of a turn — an exhausted connection pool, a stored
         * timezone the JVM no longer knows — without needing to manufacture one.
         */
        var throwOnNextSend = false

        override fun send(subscription: PushSubscription, payload: String): SendResult {
            sentEndpoints += subscription.endpoint
            sentPayloads += payload
            if (throwOnNextSend) {
                throwOnNextSend = false
                error("this User's turn blew up")
            }
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
     * requests authenticate as, so the tests that open Tucker over HTTP are the same
     * person the scheduler then considers.
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
        sender.throwOnNextSend = false
        subscriber = users.insertIfAbsent(User(id = null, email = AccessTokens.EMAIL))
    }

    /**
     * Everything one User needs to be owed a reminder: a Profile with reminders on, a
     * reading so setup is complete, an overdue review, and a device to push to.
     *
     * All four are that User's own now, so all four are seeded through [runAs] — which
     * is also what makes a second User a matter of calling this again rather than of
     * arranging what the two of them share.
     */
    private fun seedEligible(
        user: User = subscriber,
        endpoint: String = deviceA,
        timezone: String = "UTC",
        reminderHour: Int = 9,
    ) = runAs(user) {
        profiles.save(
            Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0, timezone, reminderHour, remindersEnabled = true),
        )
        subscriptions.claim(PushSubscription(null, endpoint, "BKey", "Auth", null))
        weights.save(WeightMeasurement(null, today.minusDays(1), 86.0))
        reviews.insert(
            WeeklyReview(
                null, today.minusDays(OVERDUE_BY_DAYS), 86.0,
                Maintenance(2400.0, Maintenance.Basis.FORMULA_SEED), 1850.0, 172.0,
            ),
        )
    }

    /** Somebody else, provisioned so the tick has more than one turn to take. */
    private fun somebodyElse(): User =
        users.insertIfAbsent(User(id = null, email = "second@tucker.invalid"))

    /** Read the dashboard as the subscriber — the app-open the weekly catch-up rides on. */
    private fun openTucker() {
        mockMvc.get("/api/summary") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint())
            param("date", "$today")
        }.andExpect { status { isOk() } }
    }

    @Test
    fun `sends to the subscribed device when a review is overdue and the user is absent`() {
        seedEligible()

        val result = scheduler.runTick(now)

        assertEquals(1, result.sent)
        assertEquals(listOf(deviceA), sender.sentEndpoints)
        // Stamped as the user's local day, which is what the dedupe compares.
        assertEquals(today, runAs(subscriber) { reminderState.lastReminderSentOn() })
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
        openTucker()

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
        assertEquals(listOf(deviceA), sender.sentEndpoints)
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
        runAs(subscriber) {
            subscriptions.claim(PushSubscription(null, "https://push.example/device-gone", "BKey", "Auth", null))
        }

        val result = scheduler.runTick(now)

        assertEquals(
            listOf("https://push.example/device-good"),
            runAs(subscriber) { subscriptions.findAll().map { it.endpoint } },
        )
        assertEquals(1, result.sent)
    }

    /**
     * The reminder is one per *person* per overdue episode, not one per installation
     * (ADR 0010) — so somebody coming back stands their own nudge down and nobody
     * else's.
     *
     * "Up to date" is reached the way a real User reaches it, by opening Tucker, which
     * is the whole point: that single request stamps a last-seen day and runs the review
     * that was due. Held globally, either of those alone silences the overdue User too —
     * the stamp fails their absent-today gate, and it would take a fixture that seeded a
     * recent review instead to hide it.
     */
    @Test
    fun `one User being up to date does not suppress another User's overdue reminder`() {
        seedEligible()
        openTucker()

        seedEligible(user = somebodyElse(), endpoint = deviceB)

        val result = scheduler.runTick(now)

        assertEquals(1, result.sent)
        assertEquals(listOf(deviceB), sender.sentEndpoints)
    }

    /**
     * A nudge fans out to its own User's devices and stops there.
     *
     * Both Users are owed one and both have a device, so the count is the assertion:
     * two nudges to two devices. Read globally, each turn would push to every device in
     * the installation — four sends, each person's phone buzzing twice, half of them
     * about somebody else's week.
     */
    @Test
    fun `a nudge reaches only its own User's devices`() {
        seedEligible(endpoint = deviceA)
        seedEligible(user = somebodyElse(), endpoint = deviceB)

        val result = scheduler.runTick(now)

        assertEquals(2, result.sent)
        assertEquals(listOf(deviceA, deviceB), sender.sentEndpoints)
    }

    /**
     * Each User is nudged at *their* local reminder hour, resolved from *their* Profile
     * timezone — so somebody who moved abroad is not woken on the other one's schedule.
     *
     * Brisbane is ten hours ahead of UTC, so the two 09:00s are ten hours apart and no
     * single tick can serve both. Reading one shared Profile, the timezone and hour are
     * whichever was saved last and one of these two ticks sends nothing at all.
     */
    @Test
    fun `two Users in different timezones are each nudged at their own local hour`() {
        seedEligible(timezone = "UTC", reminderHour = 9)
        seedEligible(user = somebodyElse(), endpoint = deviceB, timezone = "Australia/Brisbane", reminderHour = 9)

        // 23:00 UTC is 09:00 the next morning in Brisbane, and nowhere near 09:00 in UTC.
        val brisbaneMorning = scheduler.runTick(Instant.parse("2026-06-09T23:00:00Z"))
        val utcMorning = scheduler.runTick(now)

        assertEquals(1, brisbaneMorning.sent)
        assertEquals(1, utcMorning.sent)
        assertEquals(listOf(deviceB, deviceA), sender.sentEndpoints)
    }

    /**
     * The per-episode dedupe is one User's, so being nudged does not spend anybody
     * else's nudge.
     *
     * The second User becomes eligible only *after* the first has been nudged, which is
     * what makes this sharp: a shared dedupe is stamped by the first tick and suppresses
     * a User it has never sent anything to.
     */
    @Test
    fun `a nudge already sent to one User does not suppress another User's first`() {
        seedEligible()
        val newcomer = somebodyElse()

        val first = scheduler.runTick(now)

        seedEligible(user = newcomer, endpoint = deviceB)
        // The next day: the same overdue episode for both, so the first User is deduped
        // and only the newcomer is owed anything.
        val second = scheduler.runTick(Instant.parse("2026-06-11T09:00:00Z"))

        assertEquals(1, first.sent)
        assertEquals(1, second.sent)
        assertEquals(listOf(deviceA, deviceB), sender.sentEndpoints)
    }

    /**
     * A device two people share belongs to whoever opted in last, and its reminders
     * follow that person (ADR 0021).
     *
     * A Web Push endpoint names one browser profile on one machine, so re-subscribing
     * reassigns rather than duplicating — and the consequence that matters is here
     * rather than at the endpoint: what lands in that tray afterwards is the new owner's
     * week, and the previous owner has no device left to be nudged on.
     */
    @Test
    fun `a device that re-subscribes as somebody else is reminded as somebody else`() {
        seedEligible(endpoint = sharedBrowser)
        val newOwner = somebodyElse()
        seedEligible(user = newOwner, endpoint = sharedBrowser)

        val result = scheduler.runTick(now)

        // One send, not two: there is one device, and it is the new owner's.
        assertEquals(1, result.sent)
        assertEquals(listOf(sharedBrowser), sender.sentEndpoints)
        assertEquals(emptyList(), runAs(subscriber) { subscriptions.findAll() })
        assertEquals(
            listOf(sharedBrowser),
            runAs(newOwner) { subscriptions.findAll().map { it.endpoint } },
        )
    }

    /**
     * Forgetting a device is the opposite of claiming one, and the asymmetry needs saying
     * out loud because both answer 204.
     *
     * Subscribing is a claim only the newest opt-in can settle, so it may take a device
     * over. Unsubscribing may only ever forget one of your own — an endpoint somebody else
     * holds is not theirs to forget, and answering that identically to an endpoint nobody
     * holds is what ADR 0021 requires. The status alone cannot show the difference, so the
     * assertion is the nudge that still arrives: unscoped, the delete takes the device with
     * it and the owner's reminders simply stop, on a device still subscribed in their
     * browser.
     */
    @Test
    fun `a device stays subscribed when somebody else unsubscribes it`() {
        seedEligible()
        val other = somebodyElse()

        mockMvc.delete("/api/push/subscriptions") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = other.email))
            contentType = MediaType.APPLICATION_JSON
            content = """{"endpoint":"$deviceA"}"""
        }.andExpect { status { isNoContent() } }

        val result = scheduler.runTick(now)

        assertEquals(1, result.sent)
        assertEquals(listOf(deviceA), sender.sentEndpoints)
    }

    /**
     * A turn that fails is one User's problem, not the tick's.
     *
     * Without this, the blast radius of one exhausted connection or one unreadable row
     * would depend on where its owner happened to sort by id — the lowest-id User
     * failing would cost everyone their nudge, and the highest-id User failing would
     * cost nobody. The tick is hourly and deduped (ADR 0010), so the right answer to a
     * failure is to carry on and let the next tick retry.
     */
    @Test
    fun `a User whose turn throws does not take the rest of the tick down with them`() {
        // Both are overdue and eligible. The subscriber was provisioned first, so the
        // tick reaches them first — and their turn blows up.
        seedEligible(endpoint = deviceA)
        seedEligible(user = somebodyElse(), endpoint = deviceB)
        sender.throwOnNextSend = true

        val result = scheduler.runTick(now)

        // The second User's nudge is reachable only by carrying on past the first
        // User's failure — uncaught, `runTick` would have thrown instead of returning.
        assertEquals(1, result.sent)
        assertEquals(listOf(deviceA, deviceB), sender.sentEndpoints, "both turns were taken, one of them failing")
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

    private companion object {
        /** Comfortably past the seven-day cadence, so every seeded User is overdue. */
        const val OVERDUE_BY_DAYS = 8L

        const val deviceA = "https://push.example/device-a"
        const val deviceB = "https://push.example/device-b"

        /** One browser profile two people sign into — the device reassignment is about this. */
        const val sharedBrowser = "https://push.example/shared-browser"
    }
}
