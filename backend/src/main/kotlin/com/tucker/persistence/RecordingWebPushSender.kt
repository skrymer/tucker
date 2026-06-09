package com.tucker.persistence

import com.tucker.domain.PushSubscription
import com.tucker.domain.SendResult
import com.tucker.domain.WebPushSender
import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Profile
import org.springframework.stereotype.Component

/**
 * The `smoke`-profile [WebPushSender]: there is no real push service to talk to in
 * a smoke (the same reason the browser stub fakes `PushManager`), so this stands in
 * for the transport and reports every send delivered. The reminder slice's smoke
 * proves the decision and dedupe through the tick result, not the cryptographic
 * delivery — that boundary is exercised by the production [MartijndwarsWebPushSender].
 */
@Component
@Profile("smoke")
class RecordingWebPushSender : WebPushSender {

    override fun send(subscription: PushSubscription, payload: String): SendResult {
        log.info("[smoke] reminder push to {}", subscription.endpoint)
        return SendResult.DELIVERED
    }

    private companion object {
        val log = LoggerFactory.getLogger(RecordingWebPushSender::class.java)
    }
}
