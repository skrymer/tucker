package com.tucker.security

import org.springframework.boot.context.properties.ConfigurationProperties

/** Who an operator has made an Admin (ADR 0039): `TUCKER_ADMIN_EMAILS`, comma-separated. */
@ConfigurationProperties("tucker.admin")
data class AdminProperties(
    val emails: List<String> = emptyList(),
) {
    fun isAdmin(email: String): Boolean = emails.any { it.equals(email, ignoreCase = true) }
}
