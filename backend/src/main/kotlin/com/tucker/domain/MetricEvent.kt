package com.tucker.domain

/** What a [MetricEvent] measured, under the name it has on the wire. */
enum class MetricKind(val wire: String) {
    ROUTE_CHANGE("route-change");

    companion object {
        fun of(wire: String): MetricKind =
            entries.firstOrNull { it.wire == wire }
                ?: throw IllegalArgumentException("\"$wire\" is not a metric kind")
    }
}

/** Which of the app's two layouts the page was in, by its own breakpoint. */
enum class MetricLayout(val wire: String) {
    PHONE("phone"),
    DESKTOP("desktop");

    companion object {
        fun of(wire: String): MetricLayout =
            entries.firstOrNull { it.wire == wire }
                ?: throw IllegalArgumentException("\"$wire\" is not a layout")
    }
}

/** Where a [MetricEvent] was measured: nothing in it names the User who measured it. */
data class MetricSource(val layout: MetricLayout, val installed: Boolean, val appVersion: String) {
    init {
        require(appVersion.length <= MAX_VERSION_LENGTH) {
            "an app version must be at most $MAX_VERSION_LENGTH characters"
        }
    }

    private companion object {
        const val MAX_VERSION_LENGTH = 40
    }
}

/**
 * One measurement a browser sent (ADR 0038). Tucker's, not a User's: nothing in it
 * says who it came from.
 */
data class MetricEvent(
    val kind: MetricKind,
    val route: String,
    val valueMs: Int,
    val source: MetricSource,
) {
    init {
        require(ROUTE_TEMPLATE.matches(route)) { "\"$route\" is not a route template" }
        require(valueMs in 0..MAX_MS) { "a metric's time must be 0–$MAX_MS ms, not $valueMs" }
    }

    companion object {
        /** A minute: anything longer is a tab left in the background, not a page being slow. */
        const val MAX_MS = 60_000

        /** A page's template (`/foods/[id]`), which has no room for an id or a query string. */
        val ROUTE_TEMPLATE = Regex("/[a-z0-9/_\\-\\[\\]]{0,63}")
    }
}
