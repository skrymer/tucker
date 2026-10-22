package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** What an Admin reads of how Tucker performs (ADR 0038, ADR 0039): percentiles, never averages. */
class PerformanceReportTest {

    /** Nearest rank: the p-th percentile of n samples is the ⌈p·n⌉-th smallest. */
    @Test
    fun `states the 50th, 75th and 95th percentile of a route's times`() {
        val report = PerformanceReport.of((1..20).shuffled().map { routeChange(valueMs = it * 10) })

        val phone = report.figuresFor("/review", MetricLayout.PHONE)
        assertEquals(Percentiles(p50 = 100, p75 = 150, p95 = 190), phone.percentiles)
    }

    @Test
    fun `four samples are too few for a figure and carry only their count`() {
        val report = PerformanceReport.of(List(4) { routeChange() })

        val phone = report.figuresFor("/review", MetricLayout.PHONE)
        assertEquals(4, phone.n)
        assertNull(phone.percentiles)
    }

    @Test
    fun `four samples are too few for an api figure or a split`() {
        val phone = PerformanceReport.of(List(4) { routeChange(apiMs = 300, serverMs = 100) })
            .figuresFor("/review", MetricLayout.PHONE)

        assertNull(phone.apiP75)
        assertNull(phone.split)
    }

    @Test
    fun `five samples are enough for a figure`() {
        val report = PerformanceReport.of(List(5) { routeChange(valueMs = 300) })

        assertEquals(Percentiles(300, 300, 300), report.figuresFor("/review", MetricLayout.PHONE).percentiles)
    }

    @Test
    fun `a route measured only on a phone states desktop too, with none counted`() {
        val report = PerformanceReport.of(List(5) { routeChange(layout = MetricLayout.PHONE) })

        val desktop = report.figuresFor("/review", MetricLayout.DESKTOP)
        assertEquals(0, desktop.n)
        assertNull(desktop.percentiles)
    }

    /** By the slower of its two layouts, so a route slow on phones alone still leads. */
    @Test
    fun `lists the slowest route first and a route with too few samples last`() {
        val report = PerformanceReport.of(
            List(4) { routeChange(valueMs = 5_000).copy(route = "/today") } +
                List(5) { routeChange(layout = MetricLayout.DESKTOP, valueMs = 600).copy(route = "/foods") } +
                List(5) { routeChange(layout = MetricLayout.PHONE, valueMs = 900) } +
                List(5) { routeChange(layout = MetricLayout.DESKTOP, valueMs = 100) },
        )

        assertEquals(listOf("/review", "/foods", "/today"), report.routes.map { it.route })
    }

    @Test
    fun `states the 75th percentile of a route's wait on the api`() {
        val report = PerformanceReport.of((1..20).shuffled().map { routeChange(valueMs = 2_000, apiMs = it * 10) })

        assertEquals(150, report.figuresFor("/review", MetricLayout.PHONE).apiP75)
    }

    /** A first visit downloads the page's code too, so it is read apart from the warm ones. */
    @Test
    fun `states the 75th percentile of a route's first visits alone`() {
        val report = PerformanceReport.of(
            (1..8).map { routeChange(valueMs = it * 100).copy(firstVisit = true) } +
                List(12) { routeChange(valueMs = 9_000) },
        )

        assertEquals(600, report.figuresFor("/review", MetricLayout.PHONE).coldP75)
    }

    @Test
    fun `four first visits are too few for a cold figure and five are enough`() {
        val warm = List(10) { routeChange() }
        val cold = routeChange(valueMs = 900).copy(firstVisit = true)
        val fourCold = PerformanceReport.of(warm + List(4) { cold })
        val fiveCold = PerformanceReport.of(warm + List(5) { cold })

        assertNull(fourCold.figuresFor("/review", MetricLayout.PHONE).coldP75)
        assertEquals(900, fiveCold.figuresFor("/review", MetricLayout.PHONE).coldP75)
    }

    /**
     * Of 20 moves, the 14th–16th slowest sit between p70 and p80. Each part is the median
     * of those three, so no single navigation supplies all of them, and every other move
     * is all server time, which would show if it were counted.
     */
    @Test
    fun `splits a route's time by the median of each part across its moves from p70 to p80`() {
        val outside = ((1..13) + (17..20)).map {
            routeChange(valueMs = it * 100, apiMs = it * 100, serverMs = it * 100)
        }
        val p70ToP80 = listOf(
            routeChange(valueMs = 1_400, apiMs = 900, serverMs = 100),
            routeChange(valueMs = 1_500, apiMs = 600, serverMs = 300),
            routeChange(valueMs = 1_600, apiMs = 1_200, serverMs = 200),
        )

        val report = PerformanceReport.of((outside + p70ToP80).shuffled())

        assertEquals(
            TimeSplit(serverMs = 200, networkMs = 800, renderMs = 500),
            report.figuresFor("/review", MetricLayout.PHONE).split,
        )
    }

    private fun PerformanceReport.figuresFor(route: String, layout: MetricLayout) =
        routes.single { it.route == route }.layouts.single { it.layout == layout }

    /** A warm move to `/review`. */
    private fun routeChange(
        layout: MetricLayout = MetricLayout.PHONE,
        valueMs: Int = 420,
        apiMs: Int = 0,
        serverMs: Int = 0,
    ) = MetricEvent(
        kind = MetricKind.ROUTE_CHANGE,
        route = "/review",
        valueMs = valueMs,
        apiMs = apiMs,
        serverMs = serverMs,
        firstVisit = false,
        source = MetricSource(
            layout = layout,
            installed = false,
            appVersion = "1.4.0",
            platform = Platform(BrowserEngine.WEBKIT, OperatingSystem.IOS),
        ),
    )
}
