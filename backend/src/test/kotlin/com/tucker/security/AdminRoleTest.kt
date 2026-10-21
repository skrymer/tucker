package com.tucker.security

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.oauth2.jwt.JwtDecoder
import org.springframework.transaction.annotation.Transactional
import kotlin.test.assertEquals

/**
 * `ROLE_ADMIN` is granted where the principal is read (ADR 0039), from a real assertion
 * through the real decoder. `admin@tucker.invalid` is the suite's one listed Admin.
 */
@SpringBootTest
@Transactional
class AdminRoleTest {

    @Autowired lateinit var decoder: JwtDecoder
    @Autowired lateinit var principals: AccessPrincipalConverter

    @Test
    fun `grants a listed Admin ROLE_ADMIN`() {
        assertEquals(listOf("ROLE_ADMIN"), authoritiesOf("admin@tucker.invalid"))
    }

    private fun authoritiesOf(email: String): List<String> =
        principals.convert(decoder.decode(AccessTokens.mint(email = email)))
            .authorities.map { it.authority }
}
