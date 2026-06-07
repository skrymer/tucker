package com.tucker.domain

/**
 * One device's Web Push registration (CONTEXT.md `Push Subscription`): the
 * browser-issued [endpoint] and the [p256dh]/[auth] keys a sender encrypts to,
 * with an optional human [label]. Pure transport — it carries no schedule and no
 * timezone, which belong to the user on the [Profile]. The [endpoint] is the
 * device's identity and is unique across the store.
 */
data class PushSubscription(
    val id: Long?,
    val endpoint: String,
    val p256dh: String,
    val auth: String,
    val label: String? = null,
) {
    init {
        require(endpoint.isNotBlank()) { "endpoint must not be blank" }
        require(p256dh.isNotBlank()) { "p256dh must not be blank" }
        require(auth.isNotBlank()) { "auth must not be blank" }
    }
}
