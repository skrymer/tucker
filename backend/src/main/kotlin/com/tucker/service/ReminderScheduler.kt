package com.tucker.service

import com.tucker.domain.Profile
import com.tucker.domain.PushSubscription
import com.tucker.domain.ReminderPolicy
import com.tucker.domain.ReminderState
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.PushSubscriptionRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Instant
import java.time.ZoneId

/** The outcome of one reminder tick: how many devices a reminder was delivered to. */
data class TickResult(val sent: Int)

/**
 * The Weekly-Review Reminder *sender* (ADR 0010): Tucker's one scheduled action,
 * scoped solely to sending. It computes nothing about the review — it reads state,
 * asks the pure [ReminderPolicy] whether to nudge, and if so pushes to every device,
 * prunes any the push service reports gone, and stamps the send for dedupe.
 *
 * Thin orchestration glue (ADR 0013): the decision lives in [ReminderPolicy], the
 * transport behind [WebPushSender]; this is driven by `ReminderSchedulerIntegrationTest`
 * and the real-stack smoke. The hourly trigger is a separate, production-only bean.
 */
@Service
class ReminderScheduler(
    private val profiles: ProfileRepository,
    private val weights: WeightMeasurementRepository,
    private val reviews: WeeklyReviewRepository,
    private val subscriptions: PushSubscriptionRepository,
    private val reminderState: ReminderStateRepository,
    private val sender: WebPushSender,
) {

    /** Run one reminder tick as of [now] (the server instant), sending if eligible. */
    fun runTick(now: Instant): TickResult {
        val profile = profiles.get()
        val subs = subscriptions.findAll()
        if (profile == null || !ReminderPolicy.shouldSend(stateFor(now, profile, subs))) {
            return TickResult(sent = 0)
        }

        val delivered = subs.count { deliver(it, PAYLOAD) }
        // Stamp only on a real delivery so a transport blip retries next tick rather
        // than silently consuming the whole overdue episode (ADR 0010 dedupe).
        if (delivered > 0) reminderState.stampReminderSent(now)
        return TickResult(sent = delivered)
    }

    /** Gather everything the [ReminderPolicy] decision reads, as of [now]. */
    private fun stateFor(now: Instant, profile: Profile, subs: List<PushSubscription>) =
        ReminderState(
            now = now,
            zone = ZoneId.of(profile.timezone),
            reminderHour = profile.reminderHour,
            remindersEnabled = profile.remindersEnabled,
            setupComplete = weights.latest() != null,
            hasSubscription = subs.isNotEmpty(),
            latestReviewOn = reviews.latest()?.reviewedOn,
            lastSeenOn = reminderState.lastSeenOn(),
            lastReminderSentAt = reminderState.lastReminderSentAt(),
        )

    /** Push to one device; prune it on GONE. Returns whether it was delivered. */
    private fun deliver(subscription: PushSubscription, payload: String): Boolean =
        when (sender.send(subscription, payload)) {
            SendResult.DELIVERED -> true
            SendResult.GONE -> {
                subscriptions.deleteByEndpoint(subscription.endpoint)
                log.info("Pruned gone push subscription {}", subscription.endpoint)
                false
            }
            SendResult.FAILED -> {
                log.warn("Web push delivery failed for subscription {}", subscription.endpoint)
                false
            }
        }

    private companion object {
        val log = LoggerFactory.getLogger(ReminderScheduler::class.java)

        /**
         * The fixed nudge, as the JSON the service worker's push handler parses to
         * render the notification (it supplies the icon/badge/tag); `url` is where a
         * tap lands. A constant because the nudge is the same every time — never a
         * guilt-trip, never personalised (CONTEXT.md Weekly-Review Reminder).
         */
        const val PAYLOAD =
            """{"title":"Time for your weekly review",""" +
                """"body":"Open Tucker to log today and refresh your calorie budget.",""" +
                """"url":"/today"}"""
    }
}
