package com.tucker.domain

/** The version of the app a [MetricEvent] was measured in, a semantic version. */
class AppVersion(val value: String) : Comparable<AppVersion> {
    init {
        require(SEMVER.matches(value)) { "\"$value\" is not a semantic version" }
    }

    private val precedence = value.substringBefore('+')
    private val core: List<Int> = precedence.substringBefore('-').split('.').map(String::toInt)
    private val prerelease: List<String>? = precedence.substringAfter('-', "").ifEmpty { null }?.split('.')

    override fun compareTo(other: AppVersion): Int =
        core.zip(other.core).map { (a, b) -> a.compareTo(b) }.firstOrNull { it != 0 }
            ?: comparePrereleases(prerelease, other.prerelease)

    override fun toString() = value

    private companion object {
        /** semver.org's own pattern, which also refuses a leading zero. */
        private val SEMVER = Regex(
            "(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)" +
                "(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?" +
                "(?:\\+([0-9a-zA-Z-]+(?:\\.[0-9a-zA-Z-]+)*))?",
        )
    }
}

/** Versions as releases follow one another; two builds of one release by their text. */
val RELEASE_ORDER: Comparator<String> = compareBy<String> { AppVersion(it) }.thenBy { it }

/** A release after its prereleases, and prereleases identifier by identifier (semver.org §11.3–4). */
private fun comparePrereleases(a: List<String>?, b: List<String>?): Int {
    if (a == null || b == null) return compareValues(a == null, b == null)
    return a.zip(b).map { (x, y) -> IDENTIFIER_ORDER.compare(x, y) }.firstOrNull { it != 0 }
        ?: a.size.compareTo(b.size)
}

/** Numbers by value and before words; words by ASCII. */
private val IDENTIFIER_ORDER: Comparator<String> =
    compareBy<String> { it.toIntOrNull() == null }.thenBy { it.toIntOrNull() }.thenBy { it }
