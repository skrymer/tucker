package com.tucker.security

import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcBuilderCustomizer
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders

/**
 * Signs every test request in, so the suite says what it always said.
 *
 * A plain `@Configuration` in test sources rather than a `@TestConfiguration`, because
 * `@TestConfiguration` is excluded from component scanning and this has to reach *every*
 * context — including the four classes that fork their own — without editing the twenty
 * test classes or the ~180 `mockMvc.get/post/...` calls inside them.
 *
 * The token is real and minted fresh per request: each of those calls goes through the
 * same decoder, the same signature check and the same validators production uses, which is
 * strictly more coverage than a post-processor installing an already-trusted principal —
 * and it is why ADR 0020 could reject a verification-skipping shortcut without leaving the
 * real path untested. Minting per request rather than once per context also means a long
 * suite can never outlive its own token.
 *
 * A test that sets the header itself keeps it: this only fills the gap, so a test needing
 * a *different* identity — which is the whole of F10 #157's cross-user work — just passes
 * one, and nothing has to be turned off first. Expressing "no assertion at all" is the one
 * thing it cannot do, which is why [AccessGateTest] builds its own `MockMvc`.
 */
@Configuration
class AccessTestAuthConfig {

    @Bean
    fun signEveryRequestIn(): MockMvcBuilderCustomizer = MockMvcBuilderCustomizer { builder ->
        builder.defaultRequest(
            MockMvcRequestBuilders.get("/").with { request ->
                if (request.getHeader(ACCESS_ASSERTION_HEADER) == null) {
                    request.addHeader(ACCESS_ASSERTION_HEADER, AccessTokens.mint())
                }
                request
            },
        )
    }
}
