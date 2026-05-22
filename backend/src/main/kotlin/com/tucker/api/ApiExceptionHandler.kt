package com.tucker.api

import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestControllerAdvice

/** Thrown when a requested resource does not exist — mapped to HTTP 404. */
class NotFoundException(message: String) : RuntimeException(message)

/** The error body returned to API clients. */
data class ApiError(val message: String)

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

    /** A precondition isn't met (e.g. running a weekly review with no Goal set). */
    @ExceptionHandler(IllegalStateException::class)
    @ResponseStatus(HttpStatus.CONFLICT)
    fun handleConflict(e: IllegalStateException) = ApiError(e.message ?: "conflict")
}
