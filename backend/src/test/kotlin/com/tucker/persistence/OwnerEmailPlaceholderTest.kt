package com.tucker.persistence

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import kotlin.test.assertEquals

/**
 * That the escaping actually reaches Flyway, not just that the function is right.
 *
 * [sqlLiteralSafe] on its own proves nothing about the running application: if the
 * customizer bean were never registered, a correct function would sit unused and an
 * owner address with an apostrophe would still fail the migration. This asserts the
 * value Flyway is genuinely configured with.
 */
@SpringBootTest(properties = ["spring.flyway.placeholders.ownerEmail=o'brien@tucker.invalid"])
class OwnerEmailPlaceholderTest {

    @Autowired lateinit var flyway: Flyway

    @Test
    fun `an owner address with an apostrophe reaches Flyway escaped for a SQL literal`() {
        assertEquals(
            "o''brien@tucker.invalid",
            flyway.configuration.placeholders[OWNER_EMAIL_PLACEHOLDER],
            "the doubled quote is what keeps V9's single-quoted literal from closing early",
        )
    }
}
