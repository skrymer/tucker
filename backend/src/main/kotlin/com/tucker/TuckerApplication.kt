package com.tucker

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import java.security.Security

@SpringBootApplication
class TuckerApplication

@Suppress("SpreadOperator") // the spread is the idiomatic Spring Boot entrypoint
fun main(args: Array<String>) {
    tuneDnsCaching()
    runApplication<TuckerApplication>(*args)
}

/**
 * The container's JDK DNS resolution is intermittently flaky on a cold lookup
 * (`UnknownHostException`), which would otherwise sink the only external call —
 * the Open Food Facts barcode lookup. Cache successful resolutions for a few
 * minutes and, crucially, **never** cache the transient failures, so the
 * provider's immediate retry can re-resolve. Set before any bean (or the DNS
 * pre-warm) touches the network. Open Food Facts is the sole external host, so
 * tuning this JVM-wide is safe. See `OpenFoodFactsProvider`.
 */
private fun tuneDnsCaching() {
    Security.setProperty("networkaddress.cache.ttl", "300")
    Security.setProperty("networkaddress.cache.negative.ttl", "0")
}
