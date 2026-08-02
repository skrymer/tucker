package com.tucker.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

/**
 * The live spec's `components.schemas`, as springdoc emits it.
 *
 * Shared by the tests that guard the spec against the wire — nullability
 * ([OpenApiNullabilityTest]) and discriminator values ([OpenApiDiscriminatorTest])
 * — which read the same document along different axes.
 */
internal fun MockMvc.specSchemas(objectMapper: ObjectMapper): JsonNode =
    objectMapper.readTree(
        get("/v3/api-docs")
            .andExpect { status { isOk() } }
            .andReturn().response.contentAsString,
    ).path("components").path("schemas")
