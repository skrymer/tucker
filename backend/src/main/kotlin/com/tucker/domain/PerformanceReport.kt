package com.tucker.domain

import kotlin.math.ceil

/** Times in ms, each the nearest-rank percentile: the ⌈p·n⌉-th smallest of n samples. */
data class Percentiles(val p50: Int, val p75: Int, val p95: Int) {
    companion object {
        fun of(times: List<Int>): Percentiles {
            val sorted = times.sorted()
            return Percentiles(p50 = at(P50, sorted), p75 = at(P75, sorted), p95 = at(P95, sorted))
        }

        fun p75Of(times: List<Int>): Int = at(P75, times.sorted())

        /** Fewer, and a percentile is one navigation's luck rather than a route's speed (ADR 0038). */
        const val MIN_SAMPLES = 5

        /** The nearest-rank [p]-th percentile of [sorted]. */
        internal fun at(p: Double, sorted: List<Int>) = sorted[rankIndex(p, sorted.size)]

        internal const val P50 = 0.50
        private const val P75 = 0.75
        private const val P95 = 0.95
    }
}

/** The index of the nearest-rank [p]-th percentile in [n] sorted samples. */
private fun rankIndex(p: Double, n: Int) = ceil(p * n).toInt() - 1

/** Where a move's time went, in ms: the server, the trip there and back, and the page itself. */
data class TimeSplit(val serverMs: Int, val networkMs: Int, val renderMs: Int) {
    companion object {
        /**
         * The median of each part across the moves from p70 to p80: one p75 move is noisy,
         * and the medians of its neighbours still add up to roughly the p75.
         */
        fun of(moves: List<RouteChange>): TimeSplit {
            val sorted = moves.sortedBy { it.valueMs }
            val around = sorted.slice(rankIndex(P70, sorted.size)..rankIndex(P80, sorted.size)).map { it.split }
            fun median(part: (TimeSplit) -> Int) = Percentiles.at(Percentiles.P50, around.map(part).sorted())
            return TimeSplit(median { it.serverMs }, median { it.networkMs }, median { it.renderMs })
        }

        private const val P70 = 0.70
        private const val P80 = 0.80
    }
}

/**
 * How one route performed in one layout: its [n] always, and every figure only once
 * there are enough samples for one to mean anything. [coldP75] needs enough first
 * visits of its own.
 */
data class LayoutFigures(
    val layout: MetricLayout,
    val n: Int,
    val percentiles: Percentiles?,
    val apiP75: Int?,
    val coldP75: Int?,
    val split: TimeSplit?,
) {
    companion object {
        fun of(layout: MetricLayout, moves: List<RouteChange>): LayoutFigures {
            if (moves.size < Percentiles.MIN_SAMPLES) return LayoutFigures(layout, moves.size, null, null, null, null)
            return LayoutFigures(
                layout,
                moves.size,
                Percentiles.of(moves.map { it.valueMs }),
                Percentiles.p75Of(moves.map { it.apiMs }),
                coldP75(moves),
                TimeSplit.of(moves),
            )
        }

        private fun coldP75(moves: List<RouteChange>): Int? =
            moves.filter { it.firstVisit }.map { it.valueMs }
                .takeIf { it.size >= Percentiles.MIN_SAMPLES }
                ?.let { Percentiles.p75Of(it) }
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
        fun of(events: List<RouteChange>) = PerformanceReport(
            events.groupBy { it.route }.map { (route, ofRoute) ->
                val byLayout = ofRoute.groupBy { it.source.layout }
                RouteFigures(
                    route,
                    MetricLayout.entries.map { LayoutFigures.of(it, byLayout[it].orEmpty()) },
                )
            }.sortedWith(compareBy(nullsLast(reverseOrder())) { it.slowestP75 }),
        )
    }
}
