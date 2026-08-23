package com.tucker.service

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

/**
 * One User's Weekly-Review Reminder (ADR 0010): read their state, ask the pure
 * [ReminderPolicy] whether to nudge, and if so push to every device they have,
 * prune any the push service reports gone, and stamp the send for dedupe.
 *
 * Everything here reads and writes as *the current User*, so it must be called
 * inside the security context [ReminderScheduler] establishes — which is what
 * makes the reminder see exactly the history that User's own dashboard would
 * (ADR 0021). It knows nothing about there being more than one of them, and as of
 * issue #159 every repository it holds is scoped, so the firing rule ADR 0010
 * states is finally per person: this User's Profile decides the timezone and the
 * hour, this User's absence opens the gate, this User's dedupe closes it, and the
 * nudge reaches this User's devices and no others.
 *
 * Thin orchestration glue (ADR 0013): the decision lives in [ReminderPolicy] and
 * the transport behind [WebPushSender], so it is specified by
 * `ReminderSchedulerIntegrationTest` driving a whole tick rather than by a test
 * of its own.
 */
@Service
class UserReminder(
    private val profiles: ProfileRepository,
    private val weights: WeightMeasurementRepository,
    private val reviews: WeeklyReviewRepository,
    private val subscriptions: PushSubscriptionRepository,
    private val reminderState: ReminderStateRepository,
    private val sender: WebPushSender,
) {

    /** Nudge the current User if one is due as of [now]; returns devices delivered to. */
    fun nudgeIfDue(now: Instant): Int {
        val subs = subscriptions.findAll()
        val state = stateFor(now, subs)
        if (state == null || !ReminderPolicy.shouldSend(state)) return 0

        val delivered = subs.count { deliver(it, PAYLOAD) }
        // Stamp only on a real delivery so a transport blip retries next tick rather
        // than silently consuming the whole overdue episode (ADR 0010 dedupe).
        if (delivered > 0) reminderState.stampReminderSent(state.today)
        return delivered
    }

    /**
     * Everything the [ReminderPolicy] decision reads, as of [now] — or null when
     * this User has no Profile, since without one there is no timezone to resolve a
     * local hour in and so nothing the policy could decide.
     */
    private fun stateFor(now: Instant, subs: List<PushSubscription>): ReminderState? {
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
        private val log = LoggerFactory.getLogger(UserReminder::class.java)

        /**
         * The fixed nudge, as the JSON the service worker's push handler parses to
         * render the notification. Text only: the worker supplies the icon/badge/tag
         * and decides where a tap lands, because a frontend route is not the backend's
         * to name — the copy that used to live here disagreed with the route table for
         * months, uncaught, until a tap 404'd (issues #178, #189).
         *
         * A constant because the nudge is the same every time — never a guilt-trip,
         * never personalised (CONTEXT.md Weekly-Review Reminder).
         */
        const val PAYLOAD =
            """{"title":"Time for your weekly review",""" +
                """"body":"Open Tucker to log today and refresh your calorie budget."}"""
    }
}
