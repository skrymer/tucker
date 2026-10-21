package com.tucker.persistence

/** A Boolean as SQLite stores one: an INTEGER 0 or 1, which jOOQ generates as an Int. */
internal fun Boolean.toFlag(): Int = if (this) 1 else 0

internal fun Int.isFlagSet(): Boolean = this != 0
