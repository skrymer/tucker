package com.tucker.security

import org.junit.jupiter.api.Test
import org.springframework.boot.context.properties.bind.Binder
import org.springframework.boot.context.properties.source.MapConfigurationPropertySource
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Who `TUCKER_ADMIN_EMAILS` makes an Admin (ADR 0039), bound the way Spring binds the
 * environment so the comma-splitting under test is the framework's own.
 */
class AdminPropertiesTest {

    @Test
    fun `matches a listed address whatever its case`() {
        val admins = bind("Admin@Tucker.invalid")

        assertTrue(admins.isAdmin("admin@tucker.invalid"))
    }

    @Test
    fun `lists several addresses separated by commas, spaces around them ignored`() {
        val admins = bind("one@tucker.invalid , two@tucker.invalid")

        assertTrue(admins.isAdmin("one@tucker.invalid"))
        assertTrue(admins.isAdmin("two@tucker.invalid"))
    }

    /** `${TUCKER_ADMIN_EMAILS:}` resolves an unset variable to this. */
    @Test
    fun `makes nobody an Admin when the list is empty`() {
        assertFalse(bind("").isAdmin("admin@tucker.invalid"))
    }

    private fun bind(emails: String): AdminProperties =
        Binder(MapConfigurationPropertySource(mapOf("tucker.admin.emails" to emails)))
            .bindOrCreate("tucker.admin", AdminProperties::class.java)
}
