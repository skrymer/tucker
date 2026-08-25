package com.tucker.persistence

import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component
import java.util.concurrent.CopyOnWriteArrayList

/**
 * The `smoke`-profile [WebPushSender]: there is no real push service to talk to in
 * a smoke (the same reason the browser stub fakes `PushManager`), so this stands in
 * for the transport and reports every send delivered. The reminder smokes prove the
 * decision, the dedupe and the copy, not the cryptographic delivery — that boundary
 * is exercised by the production [MartijndwarsWebPushSender].
 *
 * It keeps what it was asked to send, because a payload leaves no trace in the
 * database: `TickResult.sent` reads the same whatever the nudge says, so a smoke
 * asserting only that count would pass with the copy rule deleted.
 * `TestSupportController` reads and clears the record.
 */
@Component
@Profile("smoke")
class RecordingWebPushSender : WebPushSender {

    /** What this run has been asked to push, oldest first. Concurrent: the tick is a request. */
    private val recorded = CopyOnWriteArrayList<String>()

    override fun send(subscription: PushSubscription, payload: String): SendResult {
        log.info("[smoke] reminder push to {}", subscription.endpoint)
        recorded += payload
        return SendResult.DELIVERED
    }

    /** Every payload sent since the last [forget], oldest first. */
    fun sentPayloads(): List<String> = recorded.toList()

    /** Drop the record, so one smoke never reads what an earlier one sent. */
    fun forget() = recorded.clear()

    private companion object {
        private val log = LoggerFactory.getLogger(RecordingWebPushSender::class.java)
    }
}
