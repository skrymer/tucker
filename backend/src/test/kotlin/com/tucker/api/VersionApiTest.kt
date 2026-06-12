package com.tucker.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest(
    properties = [
        "tucker.version=9.9.9",
        "tucker.git-sha=abc1234",
        "tucker.built-at=2026-01-01T00:00:00Z",
    ],
)
@AutoConfigureMockMvc
class VersionApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `GET version reports the baked semver, git SHA, and build time`() {
        mockMvc.get("/api/version").andExpect {
            status { isOk() }
            jsonPath("$.version") { value("9.9.9") }
            jsonPath("$.gitSha") { value("abc1234") }
            jsonPath("$.builtAt") { value("2026-01-01T00:00:00Z") }
        }
    }
}
