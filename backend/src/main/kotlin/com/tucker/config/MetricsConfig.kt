package com.tucker.config

import io.micrometer.core.instrument.Meter
import io.micrometer.core.instrument.config.MeterFilter
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

/** The shape of the server's own meters, as the Admin page reads them (ADR 0039). */
@Configuration
class MetricsConfig {

    /**
     * Drops `status`, `exception` and `error` from `http.server.requests`, so an endpoint
     * is one series per `outcome`: a percentile is computed per full tag set and cannot be
     * summed across them.
     */
    @Bean
    fun oneSeriesPerEndpointOutcome(): MeterFilter {
        val dropped = MeterFilter.ignoreTags("status", "exception", "error")
        return object : MeterFilter {
            override fun map(id: Meter.Id): Meter.Id =
                if (id.name == "http.server.requests") dropped.map(id) else id
        }
    }

    /**
     * Times Tucker's own endpoints only: not Actuator's reads, which are the Admin page reading
     * itself, nor the buckets Spring files a request under when no endpoint answered it.
     */
    @Bean
    fun onlyTuckersEndpoints(): MeterFilter = MeterFilter.deny { id ->
        val uri = id.getTag("uri").orEmpty()
        id.name == "http.server.requests" &&
            (uri.startsWith("/api/actuator/") || uri == "/**" || uri == "UNKNOWN")
    }
}
