package com.tucker.domain

import java.security.GeneralSecurityException
import java.security.ProviderException
import java.security.spec.InvalidKeySpecException

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

        /**
         * Classify a [cause] thrown while building the push from one subscription's own
         * `p256dh`/`auth`. Nothing else is decoded at that point, so a failure means
         * those keys are unusable — and they will not heal, since a browser never
         * revises the keys it issued. That is a dead device: [GONE], prune it, rather
         * than a [FAILED] the sender retries every eligible tick forever.
         *
         * Reading bad bytes has to stay open-ended, because the decoders throw an
         * open-ended set of *unchecked* types for them — `IllegalArgumentException`
         * for a point that is not on the curve, `ArrayIndexOutOfBoundsException` for
         * one that decodes to nothing — and naming them individually would quietly
         * stop pruning the moment a library upgrade picked a new one.
         *
         * Against that stands everything that is the crypto *environment* failing
         * rather than the key: it is Tucker's own fault, it fails identically for
         * every device, and reading it as [GONE] would prune the lot. Checked-ness
         * does not sort the two — [java.security.ProviderException] is unchecked and
         * is squarely an environment failure — so both forms are named, and anything
         * unrecognised falls to [FAILED] as well.
         *
         * That asymmetry is deliberate: retrying a device that really is dead costs
         * one request an hour, while pruning one that is really fine costs the user
         * their reminders silently, with no way back but re-enabling on that device.
         */
        fun fromKeyFailure(cause: Throwable): SendResult = when (cause) {
            is InvalidKeySpecException -> GONE
            is GeneralSecurityException, is ProviderException -> FAILED
            is RuntimeException -> GONE
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
