package com.tucker.domain

import java.time.Duration
import java.time.Instant

/**
 * How many metric events each User may send in a rolling hour (ADR 0038). A batch that
 * would pass the cap is refused whole and counts for nothing. Held in memory only.
 */
class MetricRateCap {

    private val admitted = mutableMapOf<Long, ArrayDeque<Admission>>()

    @Synchronized
    fun admit(userId: Long, events: Int, at: Instant): Boolean {
        val recent = admitted.getOrPut(userId) { ArrayDeque() }
        while (recent.firstOrNull()?.let { !it.at.isAfter(at.minus(WINDOW)) } == true) recent.removeFirst()
        if (recent.sumOf { it.events } + events > PER_HOUR) return false
        recent.addLast(Admission(at, events))
        return true
    }

    private data class Admission(val at: Instant, val events: Int)

    companion object {
        const val PER_HOUR = 600
        private val WINDOW: Duration = Duration.ofHours(1)
    }
}
