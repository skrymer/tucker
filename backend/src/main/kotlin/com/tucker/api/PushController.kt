package com.tucker.api

import com.tucker.domain.PushSubscription
import com.tucker.persistence.PushSubscriptionRepository
import com.tucker.persistence.VapidKeyStore
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController

/** The browser's `applicationServerKey`, served so a device can subscribe to push. */
data class VapidPublicKeyDto(val publicKey: String)

/** A browser `PushSubscription`'s encryption keys, as it serialises them. */
data class SubscriptionKeysDto(val p256dh: String, val auth: String)

/** A device's Web Push registration, in the browser `PushSubscription.toJSON()` shape. */
data class SubscriptionDto(
    val endpoint: String,
    val keys: SubscriptionKeysDto,
    val label: String? = null,
)

/** Identifies the device to forget — its push endpoint. */
data class UnsubscribeDto(val endpoint: String)

/**
 * Web Push endpoints for the Weekly-Review Reminder: hand the browser the VAPID
 * public key, and store/forget a device's Push Subscription. The reminder sender
 * that uses these subscriptions arrives in a later slice (ADR 0010).
 */
@RestController
@RequestMapping("/api/push")
class PushController(
    private val vapidKeys: VapidKeyStore,
    private val subscriptions: PushSubscriptionRepository,
) {

    @GetMapping("/vapid-public-key")
    fun vapidPublicKey(): VapidPublicKeyDto = VapidPublicKeyDto(vapidKeys.publicKeyBase64())

    @PostMapping("/subscriptions")
    @ResponseStatus(HttpStatus.CREATED)
    fun subscribe(@RequestBody request: SubscriptionDto) {
        subscriptions.save(
            PushSubscription(
                id = null,
                endpoint = request.endpoint,
                p256dh = request.keys.p256dh,
                auth = request.keys.auth,
                label = request.label,
            ),
        )
    }

    @DeleteMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun unsubscribe(@RequestBody request: UnsubscribeDto) {
        subscriptions.deleteByEndpoint(request.endpoint)
    }
}
