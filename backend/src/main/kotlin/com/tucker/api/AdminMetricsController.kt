package com.tucker.api

import com.tucker.domain.LayoutFigures
import com.tucker.domain.MetricLayout
import com.tucker.domain.PerformanceReport
import com.tucker.domain.RouteFigures
import com.tucker.persistence.MetricEventRepository
import com.tucker.security.CurrentUser
import org.springframework.http.HttpMethod
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.servlet.resource.NoResourceFoundException

/** One route in one layout: [n] always, the percentiles (ms) only once there are enough samples. */
data class LayoutFiguresResponse(
    val layout: MetricLayout,
    val n: Int,
    val p50: Int?,
    val p75: Int?,
    val p95: Int?,
) {
    constructor(figures: LayoutFigures) : this(
        figures.layout,
        figures.n,
        figures.percentiles?.p50,
        figures.percentiles?.p75,
        figures.percentiles?.p95,
    )
}

data class RouteFiguresResponse(val route: String, val layouts: List<LayoutFiguresResponse>) {
    constructor(figures: RouteFigures) : this(figures.route, figures.layouts.map(::LayoutFiguresResponse))
}

data class PerformanceReportResponse(val routes: List<RouteFiguresResponse>) {
    constructor(report: PerformanceReport) : this(report.routes.map(::RouteFiguresResponse))
}

/**
 * How Tucker performs, for an Admin (ADR 0039). Anyone else is answered as Spring answers
 * a path with nothing behind it, by throwing what Spring throws for one, so the status
 * says nothing about there being a page here they may not see.
 */
@RestController
@RequestMapping("/api/admin/metrics")
class AdminMetricsController(
    private val metrics: MetricEventRepository,
    private val currentUser: CurrentUser,
) {

    @GetMapping
    @Transactional(readOnly = true)
    fun report(): PerformanceReportResponse {
        if (!currentUser.admin) throw NoResourceFoundException(HttpMethod.GET, "api/admin/metrics")
        return PerformanceReportResponse(PerformanceReport.of(metrics.findAll()))
    }
}
