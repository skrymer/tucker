package com.tucker.security

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

/**
 * The Access gate: what the backend does with the assertion Cloudflare signs.
 *
 * Builds its own [MockMvc] instead of taking the auto-configured one, which
 * [AccessTestAuthConfig] signs in by default. That customizer yields to a header a test
 * sets itself, so the bad-token cases would survive it — but "carrying no assertion at
 * all", the case the gate exists for, cannot be expressed through it at any price.
 */
@SpringBootTest
class AccessGateTest {

    @Autowired
    private lateinit var context: WebApplicationContext

    private val mockMvc: MockMvc by lazy {
        MockMvcBuilders.webAppContextSetup(context).apply<DefaultMockMvcBuilder>(springSecurity())
            .build()
    }

    @Test
    fun `a request carrying no Access assertion is refused`() {
        mockMvc.get("/api/foods").andExpect { status { isUnauthorized() } }
    }

    // That an authenticated request behaves *exactly* as it did before the gate is
    // proven at scale by the rest of the suite, every request of which now carries a
    // real assertion (AccessTestAuthConfig). What each case here pins is that the
    // controller — not a filter — is what answered.
    @Test
    fun `a request carrying a valid Access assertion is served`() {
        mockMvc.get("/api/foods") { header(ACCESS_ASSERTION_HEADER, AccessTokens.mint()) }
            .andExpect {
                status { isOk() }
                content { contentType(MediaType.APPLICATION_JSON) }
            }
    }

    @Test
    fun `an expired assertion is refused`() {
        mockMvc.get("/api/foods") { header(ACCESS_ASSERTION_HEADER, AccessTokens.expired()) }
            .andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `an assertion whose payload was rewritten after signing is refused`() {
        mockMvc.get("/api/foods") { header(ACCESS_ASSERTION_HEADER, AccessTokens.tampered()) }
            .andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `an assertion signed by a key the backend does not trust is refused`() {
        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.signedByAnotherKey())
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `an assertion minted for another Access application is refused`() {
        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(audience = "some-other-app"))
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `an assertion from another Access team is refused`() {
        mockMvc.get("/api/foods") {
            header(
                ACCESS_ASSERTION_HEADER,
                AccessTokens.mint(issuer = "https://someone-else.cloudflareaccess.com"),
            )
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `an assertion naming no email is refused`() {
        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint(email = null))
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `an assertion whose email is not a string is refused, not a server error`() {
        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mintWithNumericEmail())
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `an assertion that never expires is refused`() {
        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.neverExpiring())
        }.andExpect { status { isUnauthorized() } }
    }

    @Test
    fun `the version endpoint answers an operator who has no assertion`() {
        mockMvc.get("/api/version").andExpect {
            status { isOk() }
            jsonPath("$.version") { exists() }
        }
    }

    @Test
    fun `the spec is served without an assertion, so it can still be regenerated`() {
        mockMvc.get("/v3/api-docs").andExpect {
            status { isOk() }
            jsonPath("$.paths['/api/foods']") { exists() }
        }
    }
}
