package com.tucker.service

import com.tucker.domain.Maintenance
import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.domain.WeeklyReview
import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.PushSubscriptionRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Primary
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * Drives the [ReminderScheduler] glue end-to-end against real repositories, with
 * the web-push transport faked at its true external boundary (ADR 0013). The fake
 * reports a subscription whose endpoint contains "gone" as 410 GONE, everything
 * else delivered, and records the endpoints it was asked to push to.
 *
 * One test also drives the real summary endpoint (hence MockMvc): the rule it pins —
 * opening Tucker advances the weekly cadence, so no reminder is owed — lives only at
 * that seam and is invisible from either side alone.
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
        override fun send(subscription: PushSubscription, payload: String): SendResult {
            sentEndpoints += subscription.endpoint
            return if ("gone" in subscription.endpoint) SendResult.GONE else SendResult.DELIVERED
        }
    }

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var scheduler: ReminderScheduler
    @Autowired lateinit var profiles: ProfileRepository
    @Autowired lateinit var weights: WeightMeasurementRepository
    @Autowired lateinit var reviews: WeeklyReviewRepository
    @Autowired lateinit var subscriptions: PushSubscriptionRepository
    @Autowired lateinit var reminderState: ReminderStateRepository
    @Autowired lateinit var sender: RecordingTestSender

    private val now = Instant.parse("2026-06-10T09:00:00Z")
    private val today = LocalDate.of(2026, 6, 10)

    /** Profile (reminders on, 09:00 UTC), a weight, an 8-day-old review, one device. */
    private fun seedEligible(endpoint: String = "https://push.example/device-a") {
        profiles.save(
            Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0, "UTC", reminderHour = 9, remindersEnabled = true),
        )
        weights.save(WeightMeasurement(null, today.minusDays(1), 86.0))
        reviews.insert(
            WeeklyReview(
                null, today.minusDays(8), 86.0,
                Maintenance(2400.0, Maintenance.Basis.FORMULA_SEED), 1850.0, 172.0,
            ),
        )
        subscriptions.save(PushSubscription(null, endpoint, "BKey", "Auth", null))
    }

    @Test
    fun `sends to the subscribed device when a review is overdue and the user is absent`() {
        seedEligible(endpoint = "https://push.example/device-a")

        val result = scheduler.runTick(now)

        assertEquals(1, result.sent)
        assertEquals(listOf("https://push.example/device-a"), sender.sentEndpoints)
        assertNotNull(reminderState.lastReminderSentAt())
    }

    @Test
    fun `owes no reminder once the user has opened Tucker, because that ran the due review`() {
        seedEligible()

        // One summary read, which is what *any* screen performs on open — the
        // dashboard and the Check tab are indistinguishable here, and that is the
        // decision, not an oversight (ADR 0010, issue #174).
        mockMvc.get("/api/summary") { param("date", "$today") }
            .andExpect { status { isOk() } }

        val result = scheduler.runTick(now)

        // Asserted by its cause, not merely by the silence: the review the reminder
        // would have nudged about has already run, dated today, so nothing is overdue.
        // Without this line a broken absent-today gate would look identical.
        assertEquals(today, reviews.latest()?.reviewedOn)
        assertEquals(0, result.sent)
        assertEquals(emptyList(), sender.sentEndpoints)
    }

    @Test
    fun `does not send a second time within the same overdue episode`() {
        seedEligible()

        val first = scheduler.runTick(now)
        // The next day, still 09:00, still away, still no fresh review — dedupe, not
        // the hour gate (which would also zero an unrelated hour), must keep it quiet.
        val second = scheduler.runTick(Instant.parse("2026-06-11T09:00:00Z"))

        assertEquals(1, first.sent)
        assertEquals(0, second.sent)
    }

    @Test
    fun `prunes a subscription the push service reports gone`() {
        seedEligible(endpoint = "https://push.example/device-good")
        subscriptions.save(PushSubscription(null, "https://push.example/device-gone", "BKey", "Auth", null))

        val result = scheduler.runTick(now)

        assertEquals(listOf("https://push.example/device-good"), subscriptions.findAll().map { it.endpoint })
        assertEquals(1, result.sent)
    }

    @Test
    fun `stays quiet outside the user's reminder hour`() {
        seedEligible()

        // 08:00 UTC, but the user asked for 09:00 — the scheduler must feed this
        // instant to the policy, which gates it out.
        val result = scheduler.runTick(Instant.parse("2026-06-10T08:00:00Z"))

        assertEquals(0, result.sent)
        assertEquals(emptyList(), sender.sentEndpoints)
    }
}
