package com.tucker.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

/**
 * The live spec, as springdoc builds it from the beans actually in the context.
 *
 * Shared by the three tests that guard the spec against the wire — nullability
 * ([OpenApiNullabilityTest]), discriminator values ([OpenApiDiscriminatorTest]), and
 * the committed snapshot the frontend types its client from ([OpenApiSnapshotTest])
 * — which read the same document along different axes. Keeping the fetch here keeps
 * `/v3/api-docs` in one place; springdoc's path is a single property away from
 * moving.
 */
internal fun MockMvc.servedSpec(objectMapper: ObjectMapper): JsonNode =
    objectMapper.readTree(
        get("/v3/api-docs")
            .andExpect { status { isOk() } }
            .andReturn().response.contentAsString,
    )

/** The `components.schemas` half of [servedSpec], which the two shape guards read. */
internal fun MockMvc.specSchemas(objectMapper: ObjectMapper): JsonNode =
    servedSpec(objectMapper).path("components").path("schemas")
