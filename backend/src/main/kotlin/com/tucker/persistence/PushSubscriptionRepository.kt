package com.tucker.persistence

import com.tucker.domain.PushSubscription
import com.tucker.jooq.Tables.PUSH_SUBSCRIPTION
import com.tucker.jooq.tables.records.PushSubscriptionRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository

/** Persistence for the per-device [PushSubscription] store (endpoint is unique). */
@Repository
class PushSubscriptionRepository(private val dsl: DSLContext) {

    fun findAll(): List<PushSubscription> =
        dsl.selectFrom(PUSH_SUBSCRIPTION)
            .orderBy(PUSH_SUBSCRIPTION.ID)
            .fetch().map { it.toDomain() }

    /**
     * Store a device's subscription, keyed on its endpoint: re-subscribing the
     * same device refreshes its keys/label rather than inserting a duplicate.
     */
    fun save(subscription: PushSubscription): PushSubscription {
        val existing = dsl.selectFrom(PUSH_SUBSCRIPTION)
            .where(PUSH_SUBSCRIPTION.ENDPOINT.eq(subscription.endpoint))
            .fetchOne()
        if (existing != null) {
            dsl.update(PUSH_SUBSCRIPTION)
                .set(PUSH_SUBSCRIPTION.P256DH, subscription.p256dh)
                .set(PUSH_SUBSCRIPTION.AUTH, subscription.auth)
                .set(PUSH_SUBSCRIPTION.LABEL, subscription.label)
                .where(PUSH_SUBSCRIPTION.ID.eq(existing.id))
                .execute()
            return subscription.copy(id = existing.id!!.toLong())
        }
        val record = dsl.newRecord(PUSH_SUBSCRIPTION)
        record.endpoint = subscription.endpoint
        record.p256dh = subscription.p256dh
        record.auth = subscription.auth
        record.label = subscription.label
        record.store()
        return subscription.copy(id = record.id!!.toLong())
    }

    /** Forget a device's subscription. Returns the number of rows removed. */
    fun deleteByEndpoint(endpoint: String): Int =
        dsl.deleteFrom(PUSH_SUBSCRIPTION)
            .where(PUSH_SUBSCRIPTION.ENDPOINT.eq(endpoint))
            .execute()

    private fun PushSubscriptionRecord.toDomain() = PushSubscription(
        id = id!!.toLong(),
        endpoint = endpoint,
        p256dh = p256dh,
        auth = auth,
        label = label,
    )
}
