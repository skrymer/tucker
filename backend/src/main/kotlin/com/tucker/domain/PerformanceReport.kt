package com.tucker.domain

import kotlin.math.ceil

/** Times in ms, each the nearest-rank percentile: the ⌈p·n⌉-th smallest of n samples. */
data class Percentiles(val p50: Int, val p75: Int, val p95: Int) {
    companion object {
        fun of(times: List<Int>): Percentiles {
            val sorted = times.sorted()
            fun at(p: Double) = sorted[ceil(p * sorted.size).toInt() - 1]
            return Percentiles(p50 = at(P50), p75 = at(P75), p95 = at(P95))
        }

        private const val P50 = 0.50
        private const val P75 = 0.75
        private const val P95 = 0.95
    }
}

/**
 * How one route performed in one layout: its [n], and its [percentiles] once there are
 * enough samples for one to mean anything.
 */
data class LayoutFigures(val layout: MetricLayout, val n: Int, val percentiles: Percentiles?) {
    companion object {
        fun of(layout: MetricLayout, times: List<Int>) = LayoutFigures(
            layout,
            times.size,
            if (times.size >= MIN_SAMPLES) Percentiles.of(times) else null,
        )

        /** Fewer, and a percentile is one navigation's luck rather than a route's speed (ADR 0038). */
        const val MIN_SAMPLES = 5
    }
}

/** How one route performed, in every layout, measured there or not. */
data class RouteFigures(val route: String, val layouts: List<LayoutFigures>) {
    /** The p75 of its slower layout, or null when no layout has a figure. */
    val slowestP75: Int? get() = layouts.mapNotNull { it.percentiles?.p75 }.maxOrNull()
}

/**
 * What an Admin reads of how Tucker performs (ADR 0039): figures per route and layout,
 * the slowest route first, so the one to fix is the first one read.
 */
data class PerformanceReport(val routes: List<RouteFigures>) {
    companion object {
        fun of(events: List<MetricEvent>) = PerformanceReport(
            events.groupBy { it.route }.map { (route, ofRoute) ->
                val byLayout = ofRoute.groupBy({ it.source.layout }, { it.valueMs })
                RouteFigures(
                    route,
                    MetricLayout.entries.map { LayoutFigures.of(it, byLayout[it].orEmpty()) },
                )
            }.sortedWith(compareBy(nullsLast(reverseOrder())) { it.slowestP75 }),
        )
    }
}
