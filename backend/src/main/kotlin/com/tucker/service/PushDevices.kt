package com.tucker.service

import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import com.tucker.persistence.PushSubscriptionRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/** The current User's push devices: listed, pushed to, and pruned once the push service reports one gone. */
@Component
class PushDevices(
    private val subscriptions: PushSubscriptionRepository,
    private val sender: WebPushSender,
) {

    fun all(): List<PushSubscription> = subscriptions.findAll()

    /** Push [payload] to each of [devices]; returns how many it was delivered to. */
    fun push(payload: String, devices: List<PushSubscription>): Int = devices.count { deliver(it, payload) }

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
        private val log = LoggerFactory.getLogger(PushDevices::class.java)
    }
}
