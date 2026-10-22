package com.tucker.domain

import com.fasterxml.jackson.annotation.JsonValue

/** The browser engine a page ran in. */
enum class BrowserEngine(@JsonValue val wire: String) {
    WEBKIT("webkit"),
    BLINK("blink"),
    GECKO("gecko"),
    OTHER("other");

    companion object {
        fun of(wire: String): BrowserEngine =
            entries.firstOrNull { it.wire == wire }
                ?: throw IllegalArgumentException("\"$wire\" is not a browser engine")
    }
}

/** The operating system a page ran on. */
enum class OperatingSystem(@JsonValue val wire: String) {
    IOS("ios"),
    ANDROID("android"),
    MACOS("macos"),
    WINDOWS("windows"),
    LINUX("linux"),
    OTHER("other");

    companion object {
        fun of(wire: String): OperatingSystem =
            entries.firstOrNull { it.wire == wire }
                ?: throw IllegalArgumentException("\"$wire\" is not an operating system")
    }
}

/**
 * What a [MetricEvent] keeps of the user agent that sent it (ADR 0038): its engine and OS,
 * never the string itself.
 */
data class Platform(val engine: BrowserEngine, val os: OperatingSystem) {
    companion object {
        fun of(userAgent: String) = Platform(engineOf(userAgent), osOf(userAgent))

        private fun osOf(userAgent: String) = when {
            "iPhone" in userAgent || "iPad" in userAgent -> OperatingSystem.IOS
            "Android" in userAgent -> OperatingSystem.ANDROID
            "Macintosh" in userAgent -> OperatingSystem.MACOS
            "Windows" in userAgent -> OperatingSystem.WINDOWS
            "Linux" in userAgent -> OperatingSystem.LINUX
            else -> OperatingSystem.OTHER
        }

        private fun engineOf(userAgent: String) = when {
            "Firefox/" in userAgent -> BrowserEngine.GECKO
            "Chrome/" in userAgent -> BrowserEngine.BLINK
            "AppleWebKit/" in userAgent -> BrowserEngine.WEBKIT
            else -> BrowserEngine.OTHER
        }
    }
}
