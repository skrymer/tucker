package com.tucker.api

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.put
import org.springframework.transaction.annotation.Transactional

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ProfileApiTest {

    @Autowired lateinit var mockMvc: MockMvc

    @Test
    fun `PUT then GET round-trips the timezone, reminder hour, and reminders-enabled flag`() {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"MALE","birthDate":"1986-05-22","heightCm":180.0,
                          "timezone":"Europe/Copenhagen","reminderHour":8,"remindersEnabled":true}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.timezone") { value("Europe/Copenhagen") }
            jsonPath("$.reminderHour") { value(8) }
            jsonPath("$.remindersEnabled") { value(true) }
        }

        mockMvc.get("/api/profile").andExpect {
            status { isOk() }
            jsonPath("$.sex") { value("MALE") }
            jsonPath("$.timezone") { value("Europe/Copenhagen") }
            jsonPath("$.reminderHour") { value(8) }
            jsonPath("$.remindersEnabled") { value(true) }
        }
    }

    @Test
    fun `a profile saved without reminder preferences reads back the safe defaults`() {
        mockMvc.put("/api/profile") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"sex":"FEMALE","birthDate":"1990-01-01","heightCm":165.0}"""
        }.andExpect { status { isOk() } }

        mockMvc.get("/api/profile").andExpect {
            status { isOk() }
            jsonPath("$.timezone") { value("UTC") }
            jsonPath("$.reminderHour") { value(9) }
            jsonPath("$.remindersEnabled") { value(false) }
        }
    }
}
