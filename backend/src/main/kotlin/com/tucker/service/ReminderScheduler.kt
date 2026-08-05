package com.tucker.service

import com.tucker.domain.PushSubscription
import com.tucker.domain.ReminderPolicy
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import com.tucker.persistence.PushSubscriptionRepository
import com.tucker.persistence.ReminderStateRepository
import com.tucker.persistence.UserRepository
import com.tucker.security.runAs
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.time.Instant

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
    private val users: UserRepository,
    private val states: ReminderStateReader,
    private val subscriptions: PushSubscriptionRepository,
    private val reminderState: ReminderStateRepository,
    private val sender: WebPushSender,
) {

    /**
     * Run one reminder tick as of [now] (the server instant), sending to whoever is
     * eligible.
     *
     * A cron thread has no request and therefore no current User, but everything a
     * reminder reads is scoped to one — so the tick gives each User their own turn
     * through [runAs] (ADR 0021). Every decision below is then the same scoped code a
     * real request runs, rather than a second set of queries free to disagree with it.
     *
     * One User's turn cannot end another's: their eligibility is decided separately,
     * so somebody who opened Tucker this morning simply contributes nothing while the
     * person who has not been seen for a week is still nudged.
     */
    fun runTick(now: Instant): TickResult =
        TickResult(sent = users.findAll().sumOf { user -> runAs(user) { tickFor(now) } })

    /** One User's turn: decide, send to their devices, and stamp the send. */
    private fun tickFor(now: Instant): Int {
        val subs = subscriptions.findAll()
        val state = states.stateFor(now, subs)
        if (state == null || !ReminderPolicy.shouldSend(state)) return 0

        val delivered = subs.count { deliver(it, PAYLOAD) }
        // Stamp only on a real delivery so a transport blip retries next tick rather
        // than silently consuming the whole overdue episode (ADR 0010 dedupe).
        if (delivered > 0) reminderState.stampReminderSent(state.today)
        return delivered
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
        val log = LoggerFactory.getLogger(ReminderScheduler::class.java)

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
