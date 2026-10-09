package com.tucker.persistence

/** A repository whose aggregate is built with its id before it is stored (ADR 0036). */
interface AggregateRepository {

    /** The id the next aggregate this repository stores is built with, drawn from [IdSequence]. */
    fun nextId(): Long
}
