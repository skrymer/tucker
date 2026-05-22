package com.tucker.api

/**
 * The id of an entity that has already been persisted — loading from or saving to
 * the database always sets it. A null here is a bug, not a client error.
 */
internal fun persistedId(id: Long?): Long =
    id ?: error("a persisted entity is missing its id")
