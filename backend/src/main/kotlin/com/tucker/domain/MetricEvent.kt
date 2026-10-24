package com.tucker.domain

import com.fasterxml.jackson.annotation.JsonValue

/** What a [MetricEvent] measured, under the name it has on the wire. */
enum class MetricKind(@JsonValue override val wire: String) : WireValue {
    ROUTE_CHANGE("route-change"),
    LCP("lcp"),
    INP("inp");

    companion object {
        fun of(wire: String): MetricKind = wireValueOf(wire, "a metric kind")
    }
}

/** Which of the app's two layouts the page was in, by its own breakpoint. */
enum class MetricLayout(@JsonValue override val wire: String) : WireValue {
    PHONE("phone"),
    DESKTOP("desktop");

    companion object {
        fun of(wire: String): MetricLayout = wireValueOf(wire, "a layout")
    }
}

/** Where a [MetricEvent] was measured: nothing in it names the User who measured it. */
data class MetricSource(
    val layout: MetricLayout,
    val installed: Boolean,
    val appVersion: String,
    val platform: Platform,
) {
    init {
        require(appVersion.length <= MAX_VERSION_LENGTH) {
            "an app version must be at most $MAX_VERSION_LENGTH characters"
        }
        // Refuses a version release order has no place for (ADR 0038).
        AppVersion(appVersion)
    }

    private companion object {
        const val MAX_VERSION_LENGTH = 40
    }
}

/**
 * One measurement a browser sent (ADR 0038). Tucker's, not a User's: nothing in it
 * says who it came from.
 */
sealed interface MetricEvent {
    val kind: MetricKind
    val route: String
    val valueMs: Int
    val source: MetricSource

    companion object {
        /** A minute: anything longer is a tab left in the background, not a page being slow. */
        const val MAX_MS = 60_000

        /** A page's template (`/foods/[id]`), which has no room for an id or a query string. */
        val ROUTE_TEMPLATE = Regex("/[a-z0-9/_\\-\\[\\]]{0,63}")

        internal fun requireMeasurement(route: String, valueMs: Int) {
            require(ROUTE_TEMPLATE.matches(route)) { "\"$route\" is not a route template" }
            require(valueMs in 0..MAX_MS) { "a metric's time must be 0–$MAX_MS ms, not $valueMs" }
        }
    }
}

/** The [MetricKind]s a [WebVital] can be. */
enum class VitalKind(val kind: MetricKind) {
    LCP(MetricKind.LCP),
    INP(MetricKind.INP),
}

/** A page load (LCP) or a tap's response (INP), on the route it happened on. */
data class WebVital(
    val vitalKind: VitalKind,
    override val route: String,
    override val valueMs: Int,
    override val source: MetricSource,
) : MetricEvent {
    init {
        MetricEvent.requireMeasurement(route, valueMs)
    }

    override val kind get() = vitalKind.kind
}

/** A move between pages, and where its time went. */
data class RouteChange(
    override val route: String,
    override val valueMs: Int,
    /** How long the move waited on `/api`, ms. */
    val apiMs: Int,
    /** The part of [apiMs] the server spent working, ms. */
    val serverMs: Int,
    /** The route's first visit since the page loaded, when its code is fetched too. */
    val firstVisit: Boolean,
    override val source: MetricSource,
) : MetricEvent {
    init {
        MetricEvent.requireMeasurement(route, valueMs)
        require(serverMs >= 0) { "a server time cannot be negative, not $serverMs" }
        require(serverMs <= apiMs) { "a server time of $serverMs ms cannot exceed the api wait of $apiMs ms" }
        require(apiMs <= valueMs) { "an api wait of $apiMs ms cannot exceed the move's $valueMs ms" }
    }

    override val kind get() = MetricKind.ROUTE_CHANGE

    /** Where the move's time went. */
    val split: TimeSplit
        get() = TimeSplit(serverMs = serverMs, networkMs = apiMs - serverMs, renderMs = valueMs - apiMs)
}
