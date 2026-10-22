package com.tucker.domain

import com.fasterxml.jackson.annotation.JsonValue

/** Every browser on iOS is WebKit, whatever it is called, and says so in its user agent. */
enum class BrowserEngine(@JsonValue override val wire: String) : WireValue {
    WEBKIT("webkit"),
    BLINK("blink"),
    GECKO("gecko"),
    OTHER("other");

    companion object {
        fun of(wire: String): BrowserEngine = wireValueOf(wire, "a browser engine")
    }
}

enum class OperatingSystem(@JsonValue override val wire: String) : WireValue {
    IOS("ios"),
    ANDROID("android"),
    MACOS("macos"),
    WINDOWS("windows"),
    LINUX("linux"),
    OTHER("other");

    companion object {
        fun of(wire: String): OperatingSystem = wireValueOf(wire, "an operating system")
    }
}

/**
 * What a [MetricEvent] keeps of the user agent that sent it (ADR 0038): its engine and OS,
 * never the string itself. An iPad asking for desktop sites, as iPadOS Safari does by
 * default, sends a Mac's user agent and is read as macOS; its engine is still WebKit.
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
