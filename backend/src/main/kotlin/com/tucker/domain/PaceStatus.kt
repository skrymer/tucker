package com.tucker.domain

import com.fasterxml.jackson.annotation.JsonValue

/**
 * Whether the observed pace is keeping up with a [Goal]'s planned rate of loss,
 * classified against that rate within a ±20% band — or [STALLED] when the Trend
 * Weight isn't falling at all.
 */
enum class PaceStatus(@JsonValue val value: String) {
    BEHIND("behind"),
    ON_PACE("on-pace"),
    AHEAD("ahead"),
    STALLED("stalled"),
}
