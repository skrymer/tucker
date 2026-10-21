package com.tucker.domain

/** The [MetricEvent]s one send carries (ADR 0038), stored all together or not at all. */
data class MetricBatch(val events: List<MetricEvent>) {
    init {
        require(events.size in 1..MAX_EVENTS) {
            "a batch must carry 1–$MAX_EVENTS metrics, not ${events.size}"
        }
    }

    companion object {
        const val MAX_EVENTS = 50
    }
}
