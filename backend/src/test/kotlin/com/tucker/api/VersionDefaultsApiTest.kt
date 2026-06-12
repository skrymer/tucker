package com.tucker.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

/**
 * With nothing baked, the endpoint must still load its context and report the
 * graceful dev/unknown defaults. This is the regression guard for the inline
 * @Value defaults: the test `application.yml` shadows the main one and defines
 * no `tucker.*` keys, so without the defaults every @SpringBootTest context
 * would fail to resolve the placeholders (not just this one).
 */
@SpringBootTest
@AutoConfigureMockMvc
class VersionDefaultsApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `GET version reports dev and unknown when no build values are baked`() {
        mockMvc.get("/api/version").andExpect {
            status { isOk() }
            jsonPath("$.version") { value("dev") }
            jsonPath("$.gitSha") { value("unknown") }
            jsonPath("$.builtAt") { value("unknown") }
        }
    }
}
