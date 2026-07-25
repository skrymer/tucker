package com.tucker.api

/**
 * The id of an entity that has already been persisted — loading from or saving to
 * the database always sets it. A null here is a bug, not a client error.
 */
internal fun persistedId(id: Long?): Long =
    id ?: error("a persisted entity is missing its id")

/**
 * Neither the catalog nor any Provider knew [barcode]. Shared by every surface a
 * scan can land on, so that splitting a genuine miss from a Provider outage
 * (issue #164) happens once rather than per endpoint.
 */
internal fun barcodeNotFound(barcode: String) =
    NotFoundException("no Food or Provider match for barcode $barcode")
