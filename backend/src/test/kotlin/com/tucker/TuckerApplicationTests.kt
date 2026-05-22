package com.tucker

import org.junit.jupiter.api.Test
import org.springframework.boot.test.context.SpringBootTest

@SpringBootTest
class TuckerApplicationTests {

    @Test
    fun contextLoads() {
        // Verifies the Spring context starts and Flyway applies V1 against SQLite.
    }
}
