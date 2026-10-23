package com.tucker.domain

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

/** Release order is semantic-version precedence (semver.org §11), whatever order they were seen in. */
class AppVersionTest {

    @Test
    fun `orders each part by number, not by text`() {
        val versions = listOf("0.10.0", "0.1.10", "1.0.0", "0.1.9", "0.2.0")

        assertEquals(listOf("0.1.9", "0.1.10", "0.2.0", "0.10.0", "1.0.0"), sorted(versions))
    }

    @Test
    fun `puts a prerelease before the release it leads up to`() {
        val versions = listOf("0.2.0", "0.2.0-rc.1", "0.1.9")

        assertEquals(listOf("0.1.9", "0.2.0-rc.1", "0.2.0"), sorted(versions))
    }

    /** semver.org §11.4: numbers by value and before words, and a longer set after its own prefix. */
    @Test
    fun `orders prereleases of one release identifier by identifier`() {
        val versions =
            listOf("1.0.0-rc.10", "1.0.0-beta", "1.0.0-rc.2", "1.0.0-rc", "1.0.0-alpha.beta", "1.0.0-alpha.1")

        assertEquals(
            listOf("1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-rc", "1.0.0-rc.2", "1.0.0-rc.10"),
            sorted(versions),
        )
    }

    /** A `+build` suffix names the build, not its place among releases (semver.org §10). */
    @Test
    fun `ignores build metadata when ordering`() {
        val versions = listOf("0.2.0-rc.1+b5", "0.2.0-rc.0+b9", "0.2.0+b1", "0.1.9+b-2")

        assertEquals(listOf("0.1.9+b-2", "0.2.0-rc.0+b9", "0.2.0-rc.1+b5", "0.2.0+b1"), sorted(versions))
    }

    @Test
    fun `refuses a version that is not a semantic version`() {
        val refused = assertFailsWith<IllegalArgumentException> { AppVersion.of("dev") }

        assertEquals("\"dev\" is not a semantic version", refused.message)
    }

    private fun sorted(versions: List<String>) = versions.map(AppVersion::of).sorted().map { it.value }
}
