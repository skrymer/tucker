package com.tucker.api

import org.springframework.beans.factory.annotation.Value
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/**
 * The running build's identity (issue #117): the semantic version from the root
 * VERSION file, the short git SHA it was built from (semver build metadata), and
 * when it was built. Surfacing it makes "what's actually deployed?" answerable,
 * and a frontend/backend SHA split flags a partial deploy.
 */
data class VersionResponse(
    val version: String,
    val gitSha: String,
    val builtAt: String,
)

/**
 * Reports the build stamp baked into the image at build time (Dockerfile ARG ->
 * ENV -> these properties). No Actuator: a single read-only endpoint over three
 * configuration values. Each @Value carries its own dev/unknown default so the
 * controller is self-sufficient even when the active property source omits the
 * key entirely — e.g. the test `application.yml`, which shadows the main one and
 * defines no `tucker.version`; without the inline default every @SpringBootTest
 * context would fail to load.
 */
@RestController
@RequestMapping("/api/version")
class VersionController(
    @param:Value("\${tucker.version:dev}") private val version: String,
    @param:Value("\${tucker.git-sha:unknown}") private val gitSha: String,
    @param:Value("\${tucker.built-at:unknown}") private val builtAt: String,
) {

    @GetMapping
    fun version() = VersionResponse(version, gitSha, builtAt)
}
