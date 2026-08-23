package com.tucker.persistence

import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import jakarta.annotation.PreDestroy
import nl.martijndwars.webpush.Encoding
import nl.martijndwars.webpush.Notification
import nl.martijndwars.webpush.PushService
import nl.martijndwars.webpush.Utils
import org.apache.http.HttpResponse
import org.apache.http.impl.nio.client.CloseableHttpAsyncClient
import org.apache.http.impl.nio.client.HttpAsyncClients
import org.apache.http.impl.nio.reactor.IOReactorConfig
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
 * smoke. What `MartijndwarsWebPushSenderTest` does pin is the part that is ours
 * either way: rejecting a subscription whose keys will not decode, which never
 * reaches the wire, and still releasing everything a send that never arrives took.
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

    /**
     * The HTTP transport, owned here rather than by the library, and kept across sends
     * instead of built for each one.
     *
     * `PushService.sendAsync` builds a *fresh* client per call and closes it again from
     * its own completion callback — a close that runs on the reactor thread and ends in
     * `reactorThread.join()`, joining itself. On a refused connect that join never
     * returns, so the client is never closed and its reactor (`availableProcessors + 1`
     * threads, plus a socket) is stranded for the life of the process. Owning one client
     * removes the per-send close entirely, so there is nothing left to deadlock.
     *
     * Built on first send, so a sender that never sends never starts a reactor at all,
     * and rebuilt if that reactor dies — see [transport].
     */
    private var transport: CloseableHttpAsyncClient? = null

    /**
     * The live transport, started and ready.
     *
     * Rebuilt when the previous one has stopped, which is the price of holding a client
     * across sends: an exception escaping the I/O reactor kills the worker and leaves
     * the client `STOPPED` for good — nothing restarts it, and `execute` answers every
     * later send with a cancellation. Discarding a client per send used to make that
     * self-healing by accident; without this it would be an hourly WARN and no reminder
     * to any device until someone restarted the app, which is the outage ADR 0010 set
     * out to avoid. Rare enough to log at ERROR when it happens.
     *
     * One dispatcher, because this client now outlives the sends instead of being
     * discarded with each one: the default sizes the reactor at `availableProcessors`,
     * which would park a thread per core for the life of the app to serve a tick that
     * sends to one device at a time. A dispatcher multiplexes, so this bounds resident
     * threads, not concurrent requests.
     *
     * [CONNECTION_TTL] because a pooled connection otherwise has no expiry, and one
     * left over from the previous tick is an hour stale — long since dropped at the far
     * end, but only *known* closed once the reactor has read the FIN, so it can be
     * handed out and fail the send. Shorter than the gap between ticks and longer than
     * one tick's burst, so reuse still pays across the devices of a single run.
     *
     * System properties stay honoured — push endpoints are third-party hosts, and that
     * is what reads any proxy and trust-store settings.
     */
    private fun transport(): CloseableHttpAsyncClient = synchronized(this) {
        transport?.let { existing ->
            if (existing.isRunning) return@synchronized existing
            log.error("Web Push transport stopped; rebuilding it for endpoint delivery")
            existing.close()
        }
        HttpAsyncClients.custom()
            .useSystemProperties()
            .setDefaultIOReactorConfig(IOReactorConfig.custom().setIoThreadCount(1).build())
            .setConnectionTimeToLive(CONNECTION_TTL.toSeconds(), TimeUnit.SECONDS)
            .build()
            .also {
                it.start()
                transport = it
            }
    }

    @PreDestroy
    fun shutdown() = synchronized(this) {
        transport?.close()
        transport = null
    }

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
     * the bound, and cancelling releases the connection.
     *
     * Only the *request* comes from the library ([PushService.preparePost] is what
     * `sendAsync` itself posts, so the bytes on the wire are unchanged); it goes out on
     * the client [transport] owns. The encoding stays explicit — real devices are
     * subscribed under `AESGCM`, and a device sent a different one fails silently
     * rather than erroring anywhere we would see it.
     */
    private fun post(notification: Notification): HttpResponse {
        val pending = transport().execute(pushService.preparePost(notification, Encoding.AESGCM), null)
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
        private val log = LoggerFactory.getLogger(MartijndwarsWebPushSender::class.java)

        /** VAPID contact, required by the spec so a push service can reach the operator. */
        const val SUBJECT = "mailto:tucker@tucker.app"

        /**
         * How long one device's send may hold the scheduler thread. Generous against a
         * congested link — a real push service answers in well under a second — and
         * short enough that even every device timing out leaves the hourly tick with
         * time to spare.
         */
        val SEND_TIMEOUT: Duration = Duration.ofSeconds(10)

        /** How long a pooled connection may be reused before it is retired. */
        val CONNECTION_TTL: Duration = Duration.ofMinutes(1)

        init {
            // web-push signs/encrypts with BouncyCastle; register it once.
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(BouncyCastleProvider())
            }
        }
    }
}
