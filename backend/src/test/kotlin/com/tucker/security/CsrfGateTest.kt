package com.tucker.security

import com.tucker.domain.Profile
import com.tucker.domain.Sex
import com.tucker.domain.WeightMeasurement
import com.tucker.persistence.ProfileRepository
import com.tucker.persistence.WeeklyReviewRepository
import com.tucker.persistence.WeightMeasurementRepository
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.response.SecurityMockMvcResultHandlers
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.context.WebApplicationContext
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
import java.time.LocalDate
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The same-origin gate: what the backend does with a request it authenticated but
 * Tucker's own page did not cause (ADR 0025).
 *
 * Builds its own [MockMvc] for the reason [AccessGateTest] does. [AccessTestAuthConfig]
 * puts a CSRF token on every request so the suite says what it always said, and
 * "carrying no token at all" — the case this gate exists for — cannot be expressed
 * through it at any price.
 */
@SpringBootTest
@Transactional
@WithTuckerUser
class CsrfGateTest {

    @Autowired private lateinit var context: WebApplicationContext
    @Autowired private lateinit var profiles: ProfileRepository
    @Autowired private lateinit var weights: WeightMeasurementRepository
    @Autowired private lateinit var reviews: WeeklyReviewRepository
    @Autowired private lateinit var handlerMappings: RequestMappingHandlerMapping

    private val mockMvc: MockMvc by lazy {
        MockMvcBuilders.webAppContextSetup(context).apply<DefaultMockMvcBuilder>(springSecurity())
            // Building its own MockMvc also opts out of the handler AccessTestAuthConfig
            // installs globally, and this class reads a scoped repository *after* a
            // request — which `SecurityContextHolderFilter` has by then cleared off the
            // test thread. Same handler, wired locally.
            .alwaysDo<DefaultMockMvcBuilder>(SecurityMockMvcResultHandlers.exportTestSecurityContext())
            .build()
    }

    /** Enough for a review to succeed, so a refusal is the gate and not a missing input. */
    private fun setupComplete(on: LocalDate) {
        profiles.save(Profile(Sex.MALE, LocalDate.of(1986, 5, 22), 180.0))
        weights.save(WeightMeasurement(null, on, 86.0))
    }

    @Test
    fun `a cross-site form POST cannot run a weekly review`() {
        setupComplete(LocalDate.now())

        // A cross-site <form> can produce a form-encoded body, provokes no preflight, and
        // carries no token — the attacker cannot read one.
        mockMvc.post("/api/weekly-review") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint())
            contentType = MediaType.APPLICATION_FORM_URLENCODED
        }.andExpect { status { isForbidden() } }

        // A Weekly Review is irreversible by design, so the status code is not the point —
        // that nothing was written is.
        assertTrue(reviews.findAll().isEmpty(), "the review ran despite being refused")
    }

    @Test
    fun `every state-changing endpoint refuses a request carrying no CSRF token`() {
        val mutations = handlerMappings.handlerMethods.keys.flatMap { mapping ->
            val methods = mapping.methodsCondition.methods.map { it.name } - SAFE_METHODS
            val paths = mapping.pathPatternsCondition?.patternValues.orEmpty()
                .map { it.replace(PATH_VARIABLE, "1") }
            methods.flatMap { method -> paths.map { path -> method to path } }
        }.distinct()

        // A vacuous sweep would pass while asserting nothing, so say what it must find:
        // every verb the API mutates with, over more endpoints than any one controller has.
        assertTrue(mutations.size > MANY_ENDPOINTS, "found only ${mutations.size} mutating endpoints")
        assertEquals(
            setOf("POST", "PUT", "DELETE"),
            mutations.map { (method, _) -> method }.toSet(),
        )

        val served = mutations.filter { (method, path) ->
            mockMvc.perform(
                request(HttpMethod.valueOf(method), path)
                    .header(ACCESS_ASSERTION_HEADER, AccessTokens.mint()),
            ).andReturn().response.status != HttpStatus.FORBIDDEN.value()
        }
        assertEquals(emptyList(), served, "these mutate without proving where they came from")
    }

    @Test
    fun `the token Tucker hands out survives the request that carries it`() {
        // Named by the response rather than restated, so the cookie is whatever the
        // repository calls it.
        val handedOut = mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint())
        }.andReturn().response.cookies.singleOrNull()
            ?: fail("the first request was handed no cookie to carry")

        val reissued = mockMvc.get("/api/foods") {
            header(ACCESS_ASSERTION_HEADER, AccessTokens.mint())
            cookie(handedOut)
        }.andReturn().response.cookies.firstOrNull { it.name == handedOut.name }

        // Silence is the whole of the healthy answer: the request came with a token, so
        // there was nothing to hand out. A stateless app re-authenticates on every request,
        // so the stock rotation strategy would instead expire it here and leave the next
        // mutation with none (ADR 0025).
        assertNull(reissued, "Tucker reissued a token it had just handed out: ${reissued?.value}")
    }

    private companion object {
        /** Spring's own set — [org.springframework.security.web.csrf.CsrfFilter.DEFAULT_CSRF_MATCHER]. */
        val SAFE_METHODS = setOf("GET", "HEAD", "TRACE", "OPTIONS")
        val PATH_VARIABLE = Regex("\\{[^}]+}")
        const val MANY_ENDPOINTS = 10
    }
}
