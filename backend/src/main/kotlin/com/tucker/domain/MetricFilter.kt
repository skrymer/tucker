package com.tucker.domain

import java.time.Instant

/** Which [MetricEvent]s an Admin is looking at. A null criterion lets every event through. */
data class MetricFilter(
    val since: Instant,
    val engine: BrowserEngine? = null,
    val appVersion: String? = null,
    val installed: Boolean? = null,
)
