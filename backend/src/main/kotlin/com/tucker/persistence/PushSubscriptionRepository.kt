package com.tucker.persistence

import com.tucker.domain.PushSubscription
import com.tucker.jooq.Tables.PUSH_SUBSCRIPTION
import com.tucker.jooq.tables.records.PushSubscriptionRecord
import com.tucker.security.CurrentUser
import org.jooq.DSLContext
import org.springframework.stereotype.Repository

/**
 * Persistence for one User's [PushSubscription]s — the devices their Weekly-Review
 * Reminder fans out to (ADR 0021).
 *
 * Scoped implicitly like everything else, with one deliberate exception in [save]:
 * `endpoint` stays **globally** unique, because it is issued by the browser and is
 * globally unique by nature. Everything a reminder reads is the caller's own, so a
 * nudge reaches its owner's devices and nobody else's.
 */
@Repository
class PushSubscriptionRepository(
    private val dsl: DSLContext,
    private val currentUser: CurrentUser,
) {

    fun findAll(): List<PushSubscription> =
        dsl.selectFrom(PUSH_SUBSCRIPTION)
            .where(PUSH_SUBSCRIPTION.USER_ID.eq(currentUser.ownerId))
            .orderBy(PUSH_SUBSCRIPTION.ID)
            .fetch().map { it.toDomain() }

    /**
     * Store a device's subscription, keyed on its endpoint: re-subscribing the same
     * device refreshes its keys/label rather than inserting a duplicate — and, if the
     * endpoint is one another User holds, **reassigns** it to the caller.
     *
     * That reassignment is why the lookup below is the one unscoped read in this class,
     * and it is a rule about devices rather than a hole in the scoping. An endpoint
     * names one browser profile on one machine; two Users holding it would be two claims
     * on a single tray, and the person who opted in most recently is the one standing in
     * front of it. Scoping the lookup instead would leave the other User's row in place
     * and the insert would then break the global uniqueness the endpoint has by nature —
     * so the alternative is not "safer", it is a 500 on a supported flow (ADR 0021).
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
                // The reassignment itself. Whoever just opted in owns this device now.
                .set(PUSH_SUBSCRIPTION.USER_ID, currentUser.ownerId)
                .where(PUSH_SUBSCRIPTION.ID.eq(existing.id))
                .execute()
            return subscription.copy(id = existing.id!!.toLong())
        }
        val record = dsl.newRecord(PUSH_SUBSCRIPTION)
        record.userId = currentUser.ownerId
        record.endpoint = subscription.endpoint
        record.p256dh = subscription.p256dh
        record.auth = subscription.auth
        record.label = subscription.label
        record.store()
        return subscription.copy(id = record.id!!.toLong())
    }

    /**
     * Forget one of the caller's own devices. Returns the number of rows removed.
     *
     * Scoped, unlike [save], and the asymmetry is the point: subscribing is a device
     * saying "reminders for *me* land here", which is a claim only the newest opt-in can
     * settle, while unsubscribing is a User forgetting a device of theirs. An endpoint
     * that has since been reassigned is no longer theirs to forget, so this removes
     * nothing and says so with a 0 — the same answer an endpoint nobody holds gets.
     */
    fun deleteByEndpoint(endpoint: String): Int =
        dsl.deleteFrom(PUSH_SUBSCRIPTION)
            .where(PUSH_SUBSCRIPTION.ENDPOINT.eq(endpoint))
            .and(PUSH_SUBSCRIPTION.USER_ID.eq(currentUser.ownerId))
            .execute()

    private fun PushSubscriptionRecord.toDomain() = PushSubscription(
        id = id!!.toLong(),
        endpoint = endpoint,
        p256dh = p256dh,
        auth = auth,
        label = label,
    )
}
