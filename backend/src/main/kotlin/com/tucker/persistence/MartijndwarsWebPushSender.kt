package com.tucker.persistence

import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import nl.martijndwars.webpush.Encoding
import nl.martijndwars.webpush.Notification
import nl.martijndwars.webpush.PushService
import nl.martijndwars.webpush.Utils
import org.apache.http.HttpResponse
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.security.KeyFactory
import java.security.KeyPair
import java.security.Security
import java.security.spec.PKCS8EncodedKeySpec
import java.time.Duration
import java.util.Base64
import java.util.concurrent.TimeUnit

/**
 * The production [WebPushSender]: delivers the reminder through the
 * `nl.martijndwars:web-push` transport, signed with the self-bootstrapped VAPID
 * keypair ([VapidKeyStore]). This is an adapter over a true external boundary
 * (ADR 0013), so what happens *across* that boundary is not specified here: the
 * status→[SendResult] mapping is the deep bit and is tested in `SendResultTest`, and
 * the scheduler glue around it is driven by the integration test and the real-stack
 * smoke. The one behaviour that never reaches the wire — rejecting a subscription
 * whose keys will not decode — is pinned in `MartijndwarsWebPushSenderTest`.
 *
 * Excluded from the `smoke` profile, where a recording fake stands in (the smoke
 * has no real push service to talk to, the same reason its browser stub fakes
 * `PushManager`).
 */
@Component
@Profile("!smoke")
class MartijndwarsWebPushSender(private val vapidKeys: VapidKeyStore) : WebPushSender {

    // Built once, lazily: the keypair is stable, and deferring construction keeps
    // context startup free of crypto work (and never fails it).
    private val pushService by lazy { buildPushService() }

    // The two halves are caught apart because they fail for unrelated reasons and
    // deserve opposite answers: building the notification decodes *this device's*
    // keys and nothing else, while the request that follows is the network's to lose.
    override fun send(subscription: PushSubscription, payload: String): SendResult {
        val notification = runCatching { buildNotification(subscription, payload) }
            .getOrElse { failure -> return keyFailure(subscription, failure) }

        return runCatching {
            SendResult.fromStatusCode(post(notification).statusLine.statusCode)
        }.getOrElse { failure ->
            // Graceful fall-through: a transport failure shouldn't abort the tick or
            // prune the device — log it and let the next eligible tick retry. Preserve
            // the interrupt flag so a shutting-down scheduler thread still stops.
            if (failure is InterruptedException) Thread.currentThread().interrupt()
            log.warn("Web Push delivery failed for endpoint {}", subscription.endpoint, failure)
            SendResult.FAILED
        }
    }

    /**
     * Judge a failure to encrypt to [subscription]'s keys, and say so in the log —
     * a pruned device disappears silently otherwise.
     *
     * `runCatching` catches [Throwable], which is wider than this decision should
     * ever reach: an [Error] means the JVM is in trouble, not that a device is, and
     * classifying it here would let one broken deployment answer GONE for every
     * subscription in turn and delete them all. Let it out and lose the tick instead.
     */
    private fun keyFailure(subscription: PushSubscription, failure: Throwable): SendResult {
        if (failure is Error) throw failure
        val outcome = SendResult.fromKeyFailure(failure)
        log.warn("Cannot encrypt to push endpoint {} ({})", subscription.endpoint, outcome, failure)
        return outcome
    }

    /** Encrypt [payload] to one device's stored keys, ready to post. */
    private fun buildNotification(subscription: PushSubscription, payload: String) = Notification(
        subscription.endpoint,
        subscription.p256dh,
        subscription.auth,
        payload.toByteArray(Charsets.UTF_8),
    )

    /**
     * Post the notification and wait — but only for [SEND_TIMEOUT].
     * `PushService.send` is an unbounded `sendAsync(…).get()`, and this runs on
     * Spring's single-threaded scheduler: a push endpoint that accepts the connection
     * and then says nothing would hold that thread forever, taking down every future
     * reminder with it, for every device, until the app is restarted. So the wait is
     * the bound, and cancelling releases the connection (the library's own callback
     * closes its client on cancellation as well as on completion).
     *
     * A timed-out device costs a little more than [SEND_TIMEOUT], because that close
     * runs here rather than on the reactor and waits on the connection pool — call it
     * a couple of seconds on top. Immaterial against an hourly tick over a handful of
     * devices, but the bound is an order of magnitude, not a promise.
     *
     * The encoding is passed explicitly because `sendAsync`'s default differs from the
     * `send` this replaces — the bound is the only change intended here.
     */
    @Suppress("DEPRECATION") // sendAsync is the only bounded way in; its successor swaps HTTP clients
    private fun post(notification: Notification): HttpResponse {
        val pending = pushService.sendAsync(notification, Encoding.AESGCM)
        try {
            return pending.get(SEND_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)
        } finally {
            pending.cancel(true)
        }
    }

    /** Rebuild the signing keypair from [VapidKeyStore]'s stored encodings. */
    private fun buildPushService(): PushService {
        val publicKey = Utils.loadPublicKey(vapidKeys.publicKeyBase64())
        val privateKey = KeyFactory.getInstance("EC").generatePrivate(
            PKCS8EncodedKeySpec(Base64.getDecoder().decode(vapidKeys.privateKeyPkcs8Base64())),
        )
        return PushService(KeyPair(publicKey, privateKey), SUBJECT)
    }

    private companion object {
        val log = LoggerFactory.getLogger(MartijndwarsWebPushSender::class.java)

        /** VAPID contact, required by the spec so a push service can reach the operator. */
        const val SUBJECT = "mailto:tucker@tucker.app"

        /**
         * How long one device's send may hold the scheduler thread. Generous against a
         * congested link — a real push service answers in well under a second — and
         * short enough that even every device timing out leaves the hourly tick with
         * time to spare.
         */
        val SEND_TIMEOUT: Duration = Duration.ofSeconds(10)

        init {
            // web-push signs/encrypts with BouncyCastle; register it once.
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(BouncyCastleProvider())
            }
        }
    }
}
