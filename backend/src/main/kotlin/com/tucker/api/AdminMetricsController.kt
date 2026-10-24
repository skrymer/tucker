package com.tucker.api

import com.tucker.domain.BrowserEngine
import com.tucker.domain.LayoutFigures
import com.tucker.domain.MetricFilter
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricRange
import com.tucker.domain.PerformanceReport
import com.tucker.domain.RELEASE_ORDER
import com.tucker.domain.ReleaseFigures
import com.tucker.domain.ReleaseLayoutFigures
import com.tucker.domain.ReleaseTrend
import com.tucker.domain.RouteFigures
import com.tucker.domain.RouteChange
import com.tucker.domain.RouteReleases
import com.tucker.domain.VitalLayoutFigures
import com.tucker.domain.WebVital
import com.tucker.domain.WebVitalReport
import com.tucker.persistence.MetricEventRepository
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import java.time.Clock

/**
 * One route in one layout: [n] always, every figure (ms) only once there are enough
 * samples. [coldP75] needs enough first visits of its own. [serverMs], [networkMs] and
 * [renderMs] are where a move around the p75 spent its time.
 */
data class LayoutFiguresResponse(
    val layout: MetricLayout,
    val n: Int,
    val p50: Int?,
    val p75: Int?,
    val p95: Int?,
    val apiP75: Int?,
    val coldP75: Int?,
    val serverMs: Int?,
    val networkMs: Int?,
    val renderMs: Int?,
) {
    constructor(figures: LayoutFigures) : this(
        figures.layout,
        figures.n,
        figures.percentiles?.p50,
        figures.percentiles?.p75,
        figures.percentiles?.p95,
        figures.apiP75,
        figures.coldP75,
        figures.split?.serverMs,
        figures.split?.networkMs,
        figures.split?.renderMs,
    )
}

data class RouteFiguresResponse(val route: String, val layouts: List<LayoutFiguresResponse>) {
    constructor(figures: RouteFigures) : this(figures.route, figures.layouts.map(::LayoutFiguresResponse))
}

/** One layout's p75 in one release (ms), only once there are enough samples. */
data class ReleaseLayoutResponse(val layout: MetricLayout, val n: Int, val p75: Int?) {
    constructor(figures: ReleaseLayoutFigures) : this(figures.layout, figures.n, figures.p75)
}

data class ReleaseFiguresResponse(val version: String, val layouts: List<ReleaseLayoutResponse>) {
    constructor(figures: ReleaseFigures) : this(figures.version, figures.layouts.map(::ReleaseLayoutResponse))
}

/** One route across every release the range holds, in release order. */
data class RouteReleasesResponse(val route: String, val releases: List<ReleaseFiguresResponse>) {
    constructor(figures: RouteReleases) : this(figures.route, figures.releases.map(::ReleaseFiguresResponse))
}

/** One web vital in one layout (ms): [n] always, the percentiles only once there are enough samples. */
data class VitalLayoutResponse(val layout: MetricLayout, val n: Int, val p50: Int?, val p75: Int?, val p95: Int?) {
    // jscpd:ignore-start — a flat wire DTO spells its percentiles out, as LayoutFiguresResponse does
    constructor(figures: VitalLayoutFigures) : this(
        figures.layout,
        figures.n,
        figures.percentiles?.p50,
        figures.percentiles?.p75,
        figures.percentiles?.p95,
    )
    // jscpd:ignore-end
}

data class WebVitalsResponse(val lcp: List<VitalLayoutResponse>, val inp: List<VitalLayoutResponse>) {
    constructor(report: WebVitalReport) :
        this(report.lcp.map(::VitalLayoutResponse), report.inp.map(::VitalLayoutResponse))
}

/**
 * [versions] are those the range holds, whichever one the report is narrowed to, and
 * [byRelease] is never narrowed to one: releases are its axis.
 */
data class PerformanceReportResponse(
    val routes: List<RouteFiguresResponse>,
    val versions: List<String>,
    val byRelease: List<RouteReleasesResponse>,
    val webVitals: WebVitalsResponse,
) {
    constructor(report: PerformanceReport, versions: List<String>, trend: ReleaseTrend, vitals: WebVitalReport) :
        this(
            report.routes.map(::RouteFiguresResponse),
            versions,
            trend.routes.map(::RouteReleasesResponse),
            WebVitalsResponse(vitals),
        )
}

/**
 * How Tucker performs, for an Admin (ADR 0039), whom
 * [com.tucker.security.AccessSecurityConfig] lets through alone.
 */
@RestController
@RequestMapping("/api/admin/metrics")
class AdminMetricsController(private val metrics: MetricEventRepository, private val clock: Clock) {

    @GetMapping
    @Transactional(readOnly = true)
    fun report(
        @RequestParam(required = false) range: MetricRange?,
        @RequestParam(required = false) engine: BrowserEngine?,
        @RequestParam(required = false) version: String?,
        @RequestParam(required = false) installed: Boolean?,
    ): PerformanceReportResponse {
        val since = (range ?: MetricRange.MONTH).since(clock.instant())
        val filter = MetricFilter(since, engine, version?.takeIf { it.isNotBlank() }, installed)
        // Releases are the trend's axis, so it reads every version whichever is chosen.
        val everyVersion = metrics.find(filter.copy(appVersion = null))
        val chosen = if (filter.appVersion == null) everyVersion else metrics.find(filter)
        return PerformanceReportResponse(
            PerformanceReport.of(chosen.filterIsInstance<RouteChange>()),
            metrics.versionsSince(since).sortedWith(RELEASE_ORDER.reversed()),
            ReleaseTrend.of(everyVersion.filterIsInstance<RouteChange>()),
            WebVitalReport.of(chosen.filterIsInstance<WebVital>()),
        )
    }

    /** A filter it cannot read, in the words the filter's own type refuses it with. */
    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    fun unreadableFilter(e: MethodArgumentTypeMismatchException) = ApiError(
        if (e.requiredType == Boolean::class.javaObjectType) {
            "${e.name} must be true or false, not \"${e.value}\""
        } else {
            e.mostSpecificCause.message ?: "${e.name} cannot be \"${e.value}\""
        },
    )
}
