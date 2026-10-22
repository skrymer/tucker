package com.tucker.api

import com.tucker.domain.BrowserEngine
import com.tucker.domain.LayoutFigures
import com.tucker.domain.MetricFilter
import com.tucker.domain.MetricLayout
import com.tucker.domain.MetricRange
import com.tucker.domain.PerformanceReport
import com.tucker.domain.RouteFigures
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

/** [versions] are those the range holds, whichever one the report is narrowed to. */
data class PerformanceReportResponse(val routes: List<RouteFiguresResponse>, val versions: List<String>) {
    constructor(report: PerformanceReport, versions: List<String>) :
        this(report.routes.map(::RouteFiguresResponse), versions)
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
        return PerformanceReportResponse(PerformanceReport.of(metrics.find(filter)), metrics.versionsSince(since))
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
