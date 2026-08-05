package com.tucker.security

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional

/**
 * [WithTuckerUser] signs the *test thread* in. This proves it does not also sign the
 * test's **HTTP requests** in.
 *
 * The distinction is easy to lose and expensive if it goes wrong. `spring-security-test`
 * is on the classpath, so Boot applies `springSecurity()` to the auto-configured MockMvc,
 * and its post-processor carries the annotation's context into every request. If that
 * context were what authenticated those requests, the two annotated classes that also
 * drive MockMvc would silently stop exercising the decoder — and ADR 0020 built the whole
 * per-request minting apparatus (and rejected a verification-skipping shortcut) precisely
 * so that path is never left uncovered.
 *
 * A tampered assertion is the sharp instrument here: it can only be refused by something
 * actually checking a signature.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class WithTuckerUserTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `a tampered assertion is still refused on a request from a signed-in class`() {
        mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.tampered())
        }.andExpect { status { isUnauthorized() } }
    }
}
