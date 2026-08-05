package com.tucker.persistence

import com.tucker.domain.User
import com.tucker.jooq.Tables.USER
import com.tucker.jooq.tables.records.UserRecord
import org.jooq.DSLContext
import org.springframework.stereotype.Repository

/**
 * Persistence for [User].
 *
 * The one repository that is deliberately *not* scoped to the current User: the
 * `user` table is not owned by anybody (ADR 0021). Looking a person up by the
 * email an assertion carries is how the current User is established in the first
 * place, so scoping it would be circular.
 */
@Repository
class UserRepository(private val dsl: DSLContext) {

    /**
     * The User with this [email], or null. The lookup is case-insensitive because
     * the column is `COLLATE NOCASE` — an assertion for `Owner@x.com` must find
     * the User stored as `owner@x.com`, not provision a second User and orphan
     * the first one's history.
     */
    fun findByEmail(email: String): User? =
        dsl.selectFrom(USER).where(USER.EMAIL.eq(email)).fetchOne()?.toUser()

    /**
     * Everyone, oldest first — the one system-level query in Tucker (ADR 0021).
     *
     * It exists for the Weekly-Review Reminder, which has no request to read a
     * User from and no single User to be about: it drives the loop that gives each
     * person their own turn through `runAs`. Ordered by id so a tick considers
     * people in a stable, reproducible order rather than SQLite's.
     */
    fun findAll(): List<User> =
        dsl.selectFrom(USER).orderBy(USER.ID).fetch().map { it.toUser() }

    /**
     * Store [user] unless their email is already taken, and return the stored row
     * either way.
     *
     * `ON CONFLICT DO NOTHING` rather than an insert whose failure is caught,
     * because a read-then-write cannot be made safe by handling its own
     * exception — and the exception in question is not the one you would expect.
     * jOOQ raises its own [org.jooq.exception.IntegrityConstraintViolationException]
     * here, not Spring's `DuplicateKeyException`, so a catch written against the
     * Spring hierarchy compiles, reads correctly, and never fires: the first two
     * devices a new person opens Tucker on would race, and one would get a 500 on
     * the very first request they ever made. Letting SQLite resolve the conflict
     * removes the branch instead of guarding it.
     */
    fun insertIfAbsent(user: User): User {
        dsl.insertInto(USER)
            .set(USER.EMAIL, user.email)
            .onConflictDoNothing()
            .execute()
        return checkNotNull(findByEmail(user.email)) {
            "insertIfAbsent neither inserted ${user.email} nor found it"
        }
    }

    private fun UserRecord.toUser(): User = User(id = id!!.toLong(), email = email)
}
