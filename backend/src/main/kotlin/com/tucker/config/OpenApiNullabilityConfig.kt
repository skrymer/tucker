package com.tucker.config

import com.fasterxml.jackson.databind.ObjectMapper
import io.swagger.v3.core.converter.AnnotatedType
import io.swagger.v3.core.converter.ModelConverter
import io.swagger.v3.core.converter.ModelConverterContext
import io.swagger.v3.oas.models.media.Schema
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.core.KotlinDetector
import kotlin.reflect.full.memberProperties

/**
 * Teaches the OpenAPI spec that a Kotlin-nullable field can arrive as `null`.
 *
 * Tucker serializes with Jackson's default inclusion, so a field the backend has
 * no value for is written as an explicit `null` rather than left out. springdoc
 * infers "not required" from Kotlin nullability and stops there — swagger-core
 * only ever emits `nullable` for an explicit `@Schema(nullable = true)`, and no
 * springdoc setting changes that. Left alone, the generated `nuxt-open-fetch`
 * client describes those fields as `T | undefined` while the wire carries
 * `T | null`: a difference `??` and falsy checks paper over, but `=== undefined`,
 * `in`, `Object.keys`, and Zod do not.
 *
 * So the nullability is read back off the Kotlin type itself, which is where it
 * was declared in the first place. Annotating each field instead would put the
 * same fact in two places and let them drift; `OpenApiNullabilityTest` fails if
 * they ever do. See [ADR 0023](../../../../../../../docs/adr/0023-absence-on-the-wire-is-an-explicit-null.md)
 * for why this is derived rather than annotated, and for the boundaries it stops at.
 */
@Configuration
class OpenApiNullabilityConfig {

    @Bean
    fun kotlinNullableModelConverter(objectMapper: ObjectMapper): ModelConverter =
        KotlinNullableModelConverter(objectMapper)
}

internal class KotlinNullableModelConverter(private val objectMapper: ObjectMapper) : ModelConverter {

    override fun resolve(
        type: AnnotatedType,
        context: ModelConverterContext,
        chain: MutableIterator<ModelConverter>,
    ): Schema<*>? {
        val resolved = if (chain.hasNext()) chain.next().resolve(type, context, chain) else null
        val kotlinClass = kotlinClassOf(type) ?: return resolved
        val properties = schemaBehind(resolved, context)?.properties.orEmpty()

        kotlinClass.memberProperties
            .filter { it.returnType.isMarkedNullable }
            .forEach { properties[it.name]?.markNullable() }

        return resolved
    }

    /**
     * The Kotlin class [type] describes, or null for anything else. The chain has
     * already resolved this type by the time we see it — swagger's own
     * `ModelResolver` constructs the same Java type first — so this call cannot be
     * the one that fails on a type the spec otherwise handles.
     */
    private fun kotlinClassOf(type: AnnotatedType) =
        objectMapper.constructType(type.type)
            .rawClass
            .takeIf { KotlinDetector.isKotlinType(it) }
            ?.kotlin

    /**
     * The schema carrying [resolved]'s properties. A model that has already been
     * registered comes back as a `$ref`, and the properties live on the
     * registered definition rather than on the reference.
     */
    private fun schemaBehind(resolved: Schema<*>?, context: ModelConverterContext): Schema<*>? =
        resolved?.`$ref`?.substringAfterLast('/')?.let { context.definedModels[it] } ?: resolved

    /**
     * OpenAPI 3.0 ignores every sibling of a `$ref`, so a nullable reference only
     * survives the round trip wrapped in the `allOf` the spec reserves for it.
     */
    private fun Schema<*>.markNullable() {
        `$ref`?.let { ref ->
            `$ref` = null
            // Mutable, because swagger's own addAllOfItem appends to this list in place.
            allOf = mutableListOf(Schema<Any>().`$ref`(ref))
        }
        // `enum` is the stricter keyword: it admits exactly what it lists, and
        // `nullable` beside it adds nothing. So a nullable enum has to list null
        // too, or the spec forbids the very value this call is marking legal.
        if (enum?.isNotEmpty() == true && !enum.contains(null)) {
            @Suppress("UNCHECKED_CAST")
            (this as Schema<Any>).addEnumItemObject(null)
        }
        nullable = true
    }
}
