package com.tucker.domain

/** One layout's moves in one release: their [n] always, their [p75] only once there are enough. */
data class ReleaseLayoutFigures(val layout: MetricLayout, val n: Int, val p75: Int?) {
    companion object {
        fun of(layout: MetricLayout, moves: List<RouteChange>) = ReleaseLayoutFigures(
            layout,
            moves.size,
            moves.takeIf { it.size >= Percentiles.MIN_SAMPLES }?.let { Percentiles.p75Of(it.map { m -> m.valueMs }) },
        )
    }
}

/** How one route performed in one release, in every layout. */
data class ReleaseFigures(val version: String, val layouts: List<ReleaseLayoutFigures>)

/** One route across every release, in release order. */
data class RouteReleases(val route: String, val releases: List<ReleaseFigures>)

/**
 * Whether a release made a route faster or slower (ADR 0038): figures per route,
 * layout and release. Every route lists every release, so one it had no moves in is a gap.
 */
data class ReleaseTrend(val routes: List<RouteReleases>) {
    companion object {
        fun of(events: List<RouteChange>): ReleaseTrend {
            val releases = events.map { it.source.appVersion }.distinct().sortedWith(RELEASE_ORDER)
            return ReleaseTrend(
                events.groupBy { it.route }.toSortedMap().map { (route, ofRoute) ->
                    val byRelease = ofRoute.groupBy { it.source.appVersion }
                    RouteReleases(route, releases.map { figuresOf(it, byRelease[it].orEmpty()) })
                },
            )
        }

        private fun figuresOf(version: String, moves: List<RouteChange>): ReleaseFigures {
            val byLayout = moves.groupBy { it.source.layout }
            return ReleaseFigures(
                version,
                MetricLayout.entries.map { ReleaseLayoutFigures.of(it, byLayout[it].orEmpty()) },
            )
        }
    }
}
