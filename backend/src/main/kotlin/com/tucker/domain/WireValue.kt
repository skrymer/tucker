package com.tucker.domain

/** An enum constant known on the wire by [wire] rather than by its name. */
interface WireValue {
    val wire: String
}

/** The constant of [E] spelled [wire], refusing any other spelling as not [what] ("a range"). */
inline fun <reified E> wireValueOf(wire: String, what: String): E where E : Enum<E>, E : WireValue =
    enumValues<E>().firstOrNull { it.wire == wire }
        ?: throw IllegalArgumentException("\"$wire\" is not $what")
