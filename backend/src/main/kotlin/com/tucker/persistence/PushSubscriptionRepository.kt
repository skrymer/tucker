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
 * Scoped implicitly like everything else, keyed on the device rather than the owner in
 * [claim]: `endpoint` stays **globally** unique, because it is issued by the browser and is
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
     * Claim a device for the caller: store its subscription, refresh the keys and label
     * of one already known, and — if the endpoint is one another User holds — take it
     * over.
     *
     * Named `claim` rather than `save` because that last case is the only place in
     * Tucker where a row changes owner, and a method called `save` would read at the
     * call site as an ordinary "write mine". The endpoint is the key here, not the
     * owner: it names one browser profile on one machine, so two Users holding it would
     * be two claims on a single notification tray, and whoever opted in most recently is
     * the person standing in front of it (ADR 0010, ADR 0021).
     *
     * That rule *is* the statement — `ON CONFLICT (endpoint) DO UPDATE`, with `user_id`
     * among the columns it sets. Written as a lookup and a branch it needed an unscoped
     * read to justify, and left a window between the two in which the row could change
     * hands.
     */
    fun claim(subscription: PushSubscription) {
        val row = dsl.newRecord(PUSH_SUBSCRIPTION).apply {
            userId = currentUser.ownerId
            endpoint = subscription.endpoint
            p256dh = subscription.p256dh
            auth = subscription.auth
            label = subscription.label
        }
        dsl.insertInto(PUSH_SUBSCRIPTION).set(row)
            .onConflict(PUSH_SUBSCRIPTION.ENDPOINT).doUpdate().set(row)
            .execute()
    }

    /**
     * Forget one of the caller's own devices. Returns the number of rows removed, which
     * no caller branches on — `DELETE /api/push/subscriptions` answers 204 either way,
     * because a status that singled out "not yours" would be the existence oracle
     * ADR 0021 forbids.
     *
     * Scoped, unlike [claim], and the asymmetry is the point: subscribing is a device
     * saying "reminders for *me* land here", which is a claim only the newest opt-in can
     * settle, while unsubscribing is a User forgetting a device of theirs. An endpoint
     * that has since been claimed by somebody else is no longer theirs to forget, so
     * this removes nothing — the same answer an endpoint nobody holds gets.
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
