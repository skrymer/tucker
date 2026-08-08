package com.tucker.api

import com.tucker.security.CurrentUser
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * Who Tucker takes the caller to be, in the one detail worth showing them: the
 * address Cloudflare Access authenticated (#160).
 *
 * Deliberately not the User's id. It is a surrogate key with no meaning outside
 * the database (ADR 0020), and putting it on the wire would invite a client to
 * hold onto it — while every scoped endpoint already resolves the owner from the
 * assertion, so nothing has an id to send back.
 */
data class MeResponse(val email: String)

/**
 * `/api/me` rather than `/api/user`, though every other path here is a domain
 * noun: a User can only ever ask about themselves (ADR 0021 — no sharing, and a
 * foreign id answers exactly as an absent one), so the path names the caller
 * instead of inviting the question of which User is being asked for.
 *
 * Gated like every other `/api` path, and that is the whole authorization story:
 * an unauthenticated caller is refused by the entry point and never arrives, so
 * there is no "who is asking?" branch to get wrong here.
 */
@RestController
@RequestMapping("/api/me")
class MeController(private val currentUser: CurrentUser) {

    @GetMapping
    fun me() = MeResponse(email = currentUser.email)
}
