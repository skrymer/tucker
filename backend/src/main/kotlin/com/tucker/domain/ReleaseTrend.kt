package com.tucker.domain

/** How one route performed in one release, in every layout. */
data class ReleaseFigures(val version: String, val layouts: List<LayoutFigures>)

/** One route across every release, in release order. */
data class RouteReleases(val route: String, val releases: List<ReleaseFigures>)

/**
 * Whether a release made a route faster or slower (ADR 0038): figures per route,
 * layout and release. Every route lists every release, so one it had no moves in is a gap.
 */
data class ReleaseTrend(val routes: List<RouteReleases>) {
    companion object {
        fun of(events: List<MetricEvent>): ReleaseTrend {
            val releases = events.map { it.source }.distinctBy { it.appVersion }.sortedBy { it.release }
                .map { it.appVersion }
            return ReleaseTrend(
                events.groupBy { it.route }.toSortedMap().map { (route, ofRoute) ->
                    val byRelease = ofRoute.groupBy { it.source.appVersion }
                    RouteReleases(route, releases.map { figuresOf(it, byRelease[it].orEmpty()) })
                },
            )
        }

        private fun figuresOf(version: String, moves: List<MetricEvent>): ReleaseFigures {
            val byLayout = moves.groupBy { it.source.layout }
            return ReleaseFigures(version, MetricLayout.entries.map { LayoutFigures.of(it, byLayout[it].orEmpty()) })
        }
    }
}
