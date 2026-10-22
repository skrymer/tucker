package com.tucker.domain

import com.fasterxml.jackson.annotation.JsonValue
import java.time.Duration
import java.time.Instant

/** How far back an Admin looks at what Tucker measured, ending now. */
enum class MetricRange(@JsonValue override val wire: String, private val days: Long) : WireValue {
    DAY("24h", days = 1),
    WEEK("7d", days = 7),
    MONTH("30d", days = 30),
    QUARTER("90d", days = 90);

    /** The earliest moment the range reaches, looking back from [now]. */
    fun since(now: Instant): Instant = now.minus(Duration.ofDays(days))

    companion object {
        fun of(wire: String): MetricRange = wireValueOf(wire, "a range")
    }
}
