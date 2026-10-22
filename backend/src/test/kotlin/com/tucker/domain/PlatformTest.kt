package com.tucker.domain

import com.tucker.domain.BrowserEngine.BLINK
import com.tucker.domain.BrowserEngine.GECKO
import com.tucker.domain.BrowserEngine.OTHER
import com.tucker.domain.BrowserEngine.WEBKIT
import com.tucker.domain.OperatingSystem.ANDROID
import com.tucker.domain.OperatingSystem.IOS
import com.tucker.domain.OperatingSystem.LINUX
import com.tucker.domain.OperatingSystem.MACOS
import com.tucker.domain.OperatingSystem.WINDOWS
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.Arguments.arguments
import org.junit.jupiter.params.provider.MethodSource
import kotlin.test.assertEquals

/** Real user agents, as the browsers Tucker's Users open it in send them. */
class PlatformTest {

    @ParameterizedTest(name = "{0}")
    @MethodSource("userAgents")
    fun `reads a browser's engine and OS from its user agent`(
        browser: String,
        userAgent: String,
        expected: Platform,
    ) {
        assertEquals(expected, Platform.of(userAgent), browser)
    }

    companion object {
        @JvmStatic
        fun userAgents(): List<Arguments> = listOf(
            arguments(
                "Safari on iPhone",
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 " +
                    "(KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
                Platform(WEBKIT, IOS),
            ),
            arguments(
                "Chrome on iPhone, which Apple makes WebKit",
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 " +
                    "(KHTML, like Gecko) CriOS/141.0.7390.96 Mobile/15E148 Safari/604.1",
                Platform(WEBKIT, IOS),
            ),
            arguments(
                "Firefox on iPhone, which Apple makes WebKit",
                "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 " +
                    "(KHTML, like Gecko) FxiOS/144.0 Mobile/15E148 Safari/605.1.15",
                Platform(WEBKIT, IOS),
            ),
            arguments(
                "Chrome on Android",
                "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/141.0.0.0 Mobile Safari/537.36",
                Platform(BLINK, ANDROID),
            ),
            arguments(
                "Firefox on Android",
                "Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0",
                Platform(GECKO, ANDROID),
            ),
            arguments(
                "Safari on a Mac",
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 " +
                    "(KHTML, like Gecko) Version/26.0 Safari/605.1.15",
                Platform(WEBKIT, MACOS),
            ),
            arguments(
                "Edge on Windows",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
                Platform(BLINK, WINDOWS),
            ),
            arguments(
                "Firefox on Linux",
                "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
                Platform(GECKO, LINUX),
            ),
            arguments(
                "Safari on iPad",
                "Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 " +
                    "(KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
                Platform(WEBKIT, IOS),
            ),
            arguments("a client that names no browser", "curl/8.5.0", Platform(OTHER, OperatingSystem.OTHER)),
        )
    }
}
