package com.tucker.api

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestControllerAdvice

/** Thrown when a requested resource does not exist — mapped to HTTP 404. */
class NotFoundException(message: String) : RuntimeException(message)

/**
 * The request was understood and the thing exists, but it cannot be processed —
 * and never will be, unlike a [NotFoundException] or a transient failure. Mapped
 * to HTTP 422 so a client can tell "try again" apart from "this will not work".
 */
class UnprocessableException(message: String) : RuntimeException(message)

/**
 * A dependency Tucker needs could not be reached, so the request settled nothing —
 * mapped to HTTP 503. Unlike a [NotFoundException] this says nothing about whether
 * the thing exists, and unlike an [UnprocessableException] it may well succeed on
 * the next try. Keeping it distinct is what lets a client advise "try again"
 * instead of "give up" (issue #164).
 */
class ServiceUnavailableException(message: String) : RuntimeException(message)

/**
 * The request names a field the caller can correct — 400, like any other domain
 * refusal, but carrying [field] so a form can show it against the input that is
 * wrong rather than against whichever one it routes 400s to by default.
 *
 * An [IllegalArgumentException] because that is what it is: one family for caller
 * error, so nothing that already handles the general case changes behaviour. The
 * more specific handler below is what puts [field] on the wire.
 */
class InvalidFieldException(val field: String, message: String) : IllegalArgumentException(message)

/**
 * The error body returned to API clients. [field] is the request field at fault
 * where one can be named, and null otherwise — which is most refusals.
 */
data class ApiError(val message: String, val field: String? = null)

/**
 * Translates exceptions into HTTP responses. Domain invariant violations surface
 * as [IllegalArgumentException] (from `require` in the domain) and become 400s.
 */
@RestControllerAdvice
class ApiExceptionHandler {

    @ExceptionHandler(NotFoundException::class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    fun handleNotFound(e: NotFoundException) = ApiError(e.message ?: "not found")

    @ExceptionHandler(IllegalArgumentException::class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    fun handleBadRequest(e: IllegalArgumentException) = ApiError(e.message ?: "bad request")

    @ExceptionHandler(InvalidFieldException::class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    fun handleInvalidField(e: InvalidFieldException) =
        ApiError(e.message ?: "bad request", e.field)

    /** A precondition isn't met (e.g. running a weekly review with no Goal set). */
    @ExceptionHandler(IllegalStateException::class)
    @ResponseStatus(HttpStatus.CONFLICT)
    fun handleConflict(e: IllegalStateException) = ApiError(e.message ?: "conflict")

    @ExceptionHandler(UnprocessableException::class)
    @ResponseStatus(HttpStatus.UNPROCESSABLE_ENTITY)
    fun handleUnprocessable(e: UnprocessableException) = ApiError(e.message ?: "unprocessable")

    @ExceptionHandler(ServiceUnavailableException::class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    fun handleUnavailable(e: ServiceUnavailableException) = ApiError(e.message ?: "service unavailable")
}
