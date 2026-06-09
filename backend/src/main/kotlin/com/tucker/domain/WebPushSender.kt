package com.tucker.domain

/**
 * The outcome of delivering one Web Push to one [PushSubscription].
 *
 * The push *service* (the browser vendor's endpoint) answers with an HTTP status;
 * [fromStatusCode] folds that into the only three outcomes the reminder sender
 * cares about: it was accepted, the subscription is dead and must be pruned, or it
 * failed transiently and should be retried at the next eligible tick.
 */
enum class SendResult {
    /** The push service accepted the message (a 2xx). */
    DELIVERED,

    /** The subscription is gone (404/410) — prune it. */
    GONE,

    /** A transient failure (anything else) — leave the subscription, retry later. */
    FAILED,

    ;

    companion object {
        private const val OK = 200
        private const val CREATED = 201
        private const val NO_CONTENT = 204
        private const val NOT_FOUND = 404
        private const val GONE_STATUS = 410

        /** Classify a push-service HTTP [code] into a [SendResult]. */
        fun fromStatusCode(code: Int): SendResult = when (code) {
            OK, CREATED, NO_CONTENT -> DELIVERED
            NOT_FOUND, GONE_STATUS -> GONE
            else -> FAILED
        }
    }
}

/**
 * The port over the Web Push transport (ADR 0013's "true external boundary"):
 * deliver [payload] to one device's [PushSubscription] and report the [SendResult].
 * The production adapter signs with the VAPID keypair; tests/smokes swap in a fake.
 */
interface WebPushSender {
    fun send(subscription: PushSubscription, payload: String): SendResult
}
