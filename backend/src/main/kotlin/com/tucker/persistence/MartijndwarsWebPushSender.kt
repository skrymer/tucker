package com.tucker.persistence

import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import nl.martijndwars.webpush.Notification
import nl.martijndwars.webpush.PushService
import nl.martijndwars.webpush.Utils
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.security.KeyFactory
import java.security.KeyPair
import java.security.Security
import java.security.spec.PKCS8EncodedKeySpec
import java.util.Base64

/**
 * The production [WebPushSender]: delivers the reminder through the
 * `nl.martijndwars:web-push` transport, signed with the self-bootstrapped VAPID
 * keypair ([VapidKeyStore]). This is an adapter over a true external boundary
 * (ADR 0013) — no behaviour test of its own; the status→[SendResult] mapping it
 * relies on is the deep bit and is tested in `SendResultTest`, and the scheduler
 * glue around it is driven by the integration test and the real-stack smoke.
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

    override fun send(subscription: PushSubscription, payload: String): SendResult =
        runCatching {
            val notification = Notification(
                subscription.endpoint,
                subscription.p256dh,
                subscription.auth,
                payload.toByteArray(Charsets.UTF_8),
            )
            SendResult.fromStatusCode(pushService.send(notification).statusLine.statusCode)
        }.getOrElse { failure ->
            // Graceful fall-through: a transport failure shouldn't abort the tick or
            // prune the device — log it and let the next eligible tick retry. Preserve
            // the interrupt flag so a shutting-down scheduler thread still stops.
            if (failure is InterruptedException) Thread.currentThread().interrupt()
            log.warn("Web Push delivery failed for endpoint {}", subscription.endpoint, failure)
            SendResult.FAILED
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

        init {
            // web-push signs/encrypts with BouncyCastle; register it once.
            if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
                Security.addProvider(BouncyCastleProvider())
            }
        }
    }
}
