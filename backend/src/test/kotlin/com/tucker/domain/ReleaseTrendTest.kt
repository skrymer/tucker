package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

/** p75 per route, layout and release (ADR 0038): whether a release made a route faster or slower. */
class ReleaseTrendTest {

    @Test
    fun `states each release's p75 apart, and none for a release with fewer than five moves`() {
        val trend = ReleaseTrend.of(
            List(5) { routeChange("1.4.0", valueMs = 400) } +
                List(5) { routeChange("1.5.0", valueMs = 250) } +
                List(4) { routeChange("1.6.0", valueMs = 100) },
        )

        assertEquals(
            listOf("1.4.0" to Figure(5, 400), "1.5.0" to Figure(5, 250), "1.6.0" to Figure(4, null)),
            trend.figuresFor("/review", MetricLayout.PHONE),
        )
    }

    @Test
    fun `lists releases in release order, whatever order their moves arrived in`() {
        val trend = ReleaseTrend.of(listOf("0.1.10", "0.2.0", "0.1.9", "0.2.0-rc.1").map { routeChange(it) })

        assertEquals(
            listOf("0.1.9", "0.1.10", "0.2.0-rc.1", "0.2.0"),
            trend.routes.single().releases.map { it.version },
        )
    }

    /** Two builds of one release share its precedence, so their order falls back to the text. */
    @Test
    fun `lists two builds of one release by their text, whatever order their moves arrived in`() {
        val trend = ReleaseTrend.of(listOf("0.2.0+b2", "0.2.0+b10", "0.1.0").map { routeChange(it) })

        assertEquals(
            listOf("0.1.0", "0.2.0+b10", "0.2.0+b2"),
            trend.routes.single().releases.map { it.version },
        )
    }

    /** The charts share one x-axis, so a release a route was never visited in is a gap, not a missing tick. */
    @Test
    fun `gives every route every release, with no figure where the route had no moves`() {
        val trend = ReleaseTrend.of(
            List(5) { routeChange("1.4.0", route = "/foods") } + List(5) { routeChange("1.5.0", route = "/review") },
        )

        assertEquals(
            listOf("1.4.0" to Figure(5, 420), "1.5.0" to Figure(0, null)),
            trend.figuresFor("/foods", MetricLayout.PHONE),
        )
        assertEquals(
            listOf("1.4.0" to Figure(0, null), "1.5.0" to Figure(5, 420)),
            trend.figuresFor("/review", MetricLayout.PHONE),
        )
    }

    /** A chart stays where it was found from one look to the next, however its figures move. */
    @Test
    fun `lists routes by name`() {
        val routes = listOf("/review", "/foods/[id]", "/", "/foods")

        val trend = ReleaseTrend.of(routes.map { routeChange("1.4.0", route = it) })

        assertEquals(listOf("/", "/foods", "/foods/[id]", "/review"), trend.routes.map { it.route })
    }

    private data class Figure(val n: Int, val p75: Int?)

    private fun ReleaseTrend.figuresFor(route: String, layout: MetricLayout) =
        routes.single { it.route == route }.releases.map { release ->
            val figures = release.layouts.single { it.layout == layout }
            release.version to Figure(figures.n, figures.p75)
        }

    private fun routeChange(
        appVersion: String,
        route: String = "/review",
        layout: MetricLayout = MetricLayout.PHONE,
        valueMs: Int = 420,
    ) = RouteChange(
        route = route,
        valueMs = valueMs,
        apiMs = 0,
        serverMs = 0,
        firstVisit = false,
        source = MetricSource(
            layout = layout,
            installed = false,
            appVersion = appVersion,
            platform = Platform(BrowserEngine.WEBKIT, OperatingSystem.IOS),
        ),
    )
}
