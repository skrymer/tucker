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
        val nudge = dueNudge(now, subs) ?: return 0

        val delivered = subs.count { deliver(it, nudge.payload) }
        // Stamp only on a real delivery so a transport blip retries next tick rather
        // than silently consuming the whole overdue episode (ADR 0010 dedupe).
        if (delivered > 0) reminderState.stampReminderSent(nudge.state.today)
        return delivered
    }

    /**
     * The nudge this User is owed as of [now], or null if none is: the pure
     * [ReminderPolicy] decision, and — since only the Profile that answered it knows
     * what half of Tucker this User uses — the words that go with the answer.
     */
    private fun dueNudge(now: Instant, subs: List<PushSubscription>): DueNudge? {
        // No Profile means no timezone to resolve a local hour in, so there is nothing
        // the policy could decide and no copy to choose.
        val profile = profiles.get() ?: return null
        val state = stateFor(now, profile, subs)
        return if (ReminderPolicy.shouldSend(state)) DueNudge(payloadFor(profile), state) else null
    }

    /** Everything the [ReminderPolicy] decision reads, as of [now]. */
    private fun stateFor(now: Instant, profile: Profile, subs: List<PushSubscription>): ReminderState =
        ReminderState(
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

    /** What the nudge says — Calorie Tracking is the only thing it varies with. */
    private fun payloadFor(profile: Profile): String =
        if (profile.tracksCalories) TRACKING_PAYLOAD else WEIGHT_ONLY_PAYLOAD

    /**
     * A nudge that is owed: what to say, and the state that decided it — which is also
     * where the local day the send is stamped on comes from.
     *
     * A holder rather than two returns from [nudgeIfDue], because the copy and the
     * decision are read from one Profile and the alternative is reading it twice.
     */
    private data class DueNudge(val payload: String, val state: ReminderState)

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
         * The title both nudges carry: a Weekly Review comes due on the same cadence
         * whatever a User tracks, and it is the review the nudge is about.
         *
         * Both payloads are the JSON the service worker's push handler parses, and both
         * are text alone: the worker supplies the icon/badge/tag and decides where a tap
         * lands, because a frontend route is not the backend's to name (issues #178, #189).
         */
        private const val TITLE = "Time for your weekly review"

        /** The nudge for a User doing Calorie Tracking. */
        private const val TRACKING_PAYLOAD =
            """{"title":"$TITLE",""" +
                """"body":"Open Tucker to log today and refresh your calorie budget."}"""

        /**
         * The nudge for a User with Calorie Tracking off, who logs no food and whose
         * review carries no Calorie Budget to refresh (ADR 0024) — so it names the half
         * of Tucker they do use. Constant per setting rather than per person: still never
         * a guilt-trip, still never personalised (CONTEXT.md Weekly-Review Reminder).
         */
        private const val WEIGHT_ONLY_PAYLOAD =
            """{"title":"$TITLE",""" +
                """"body":"Open Tucker to log your weight and refresh your trend."}"""
    }
}
