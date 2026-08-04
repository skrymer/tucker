package com.tucker.security

import org.junit.jupiter.api.Test
import org.springframework.boot.autoconfigure.AutoConfigurations
import org.springframework.boot.autoconfigure.validation.ValidationAutoConfiguration
import org.springframework.boot.context.properties.EnableConfigurationProperties
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.context.annotation.Configuration
import kotlin.test.assertTrue

/**
 * That a backend without Access settings refuses to start.
 *
 * Four documents promise this — [AccessProperties]' own KDoc, `CLAUDE.md`, `deploy/README.md`
 * and `dev/access-key/README.md` — because it is what stops a production deploy quietly
 * falling back to a signing key that is committed to a public repository. It rests entirely
 * on `@Validated` + `@field:NotBlank`, which read as decorative next to fields that bind to
 * `""`; delete those two annotations and every other test in the suite still passes while
 * the guarantee is gone. This is the test that notices.
 */
class AccessPropertiesTest {

    private val contexts = ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(ValidationAutoConfiguration::class.java))
        .withUserConfiguration(BindAccessProperties::class.java)

    @Test
    fun `a backend given no Access settings refuses to start`() {
        contexts.run { context ->
            assertTrue(context.startupFailure != null, "a blank issuer must fail the context")
            assertTrue(
                context.startupFailure!!.stackTraceToString().contains("TUCKER_ACCESS_ISSUER"),
                "the failure must name the env var to set",
            )
        }
    }

    @Test
    fun `a backend given all three starts`() {
        contexts.withPropertyValues(
            "tucker.access.issuer=${AccessTokens.ISSUER}",
            "tucker.access.audience=${AccessTokens.AUDIENCE}",
            "tucker.access.jwk-set-uri=${AccessTokens.JWK_SET_URI}",
        ).run { context ->
            assertTrue(context.startupFailure == null, "${context.startupFailure}")
        }
    }

    @Configuration
    @EnableConfigurationProperties(AccessProperties::class)
    class BindAccessProperties
}
