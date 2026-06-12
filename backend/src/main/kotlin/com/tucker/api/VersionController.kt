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
 * configuration values. The properties default to dev/unknown so a local
 * `bootRun` or a CI image built without the args never fails to start.
 */
@RestController
@RequestMapping("/api/version")
class VersionController(
    @param:Value("\${tucker.version}") private val version: String,
    @param:Value("\${tucker.git-sha}") private val gitSha: String,
    @param:Value("\${tucker.built-at}") private val builtAt: String,
) {

    @GetMapping
    fun version() = VersionResponse(version, gitSha, builtAt)
}
