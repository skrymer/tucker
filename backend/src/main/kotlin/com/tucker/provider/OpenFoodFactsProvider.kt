package com.tucker.provider

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.tucker.domain.FoodCandidate
import com.tucker.domain.NutritionProvider
import com.tucker.domain.ProviderCapability
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient

/** OFF v2 product response. `status` is 1 when the product exists, 0 on a miss. */
@JsonIgnoreProperties(ignoreUnknown = true)
data class OffResponse(
    val status: Int,
    val product: OffProduct?,
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class OffProduct(
    @param:JsonProperty("product_name") val productName: String?,
    val nutriments: OffNutriments?,
)

/**
 * The per-100g (or, for liquids, per-100ml — treated as per-100g at density 1.0)
 * macro fields OFF publishes. Energy is OFF's stated value, kept only as a
 * cross-check.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
data class OffNutriments(
    @param:JsonProperty("proteins_100g") val proteins100g: Double?,
    @param:JsonProperty("carbohydrates_100g") val carbohydrates100g: Double?,
    @param:JsonProperty("fat_100g") val fat100g: Double?,
    @param:JsonProperty("energy-kcal_100g") val energyKcal100g: Double?,
)

/**
 * A [NutritionProvider] backed by the keyless Open Food Facts product API
 * (ADR 0006). v1: online lookup, descriptive `User-Agent` (OFF IP-bans anonymous
 * callers), ODbL attribution via the `source`. A timeout, rate-limit, or network
 * failure returns `null` so the chain falls through.
 */
@Component
class OpenFoodFactsProvider(builder: RestClient.Builder) : NutritionProvider {

    private val client: RestClient = builder
        .baseUrl(BASE_URL)
        .defaultHeader(HttpHeaders.USER_AGENT, USER_AGENT)
        .build()

    override val capabilities: Set<ProviderCapability> = setOf(ProviderCapability.BARCODE_LOOKUP)

    override fun lookupByBarcode(barcode: String): FoodCandidate? {
        // A timeout / 429 / network error is swallowed to null so the chain falls
        // through to the next Provider (ADR 0006, "caching, not a rate limiter").
        val response = runCatching {
            client.get()
                .uri("/api/v2/product/{barcode}.json", barcode)
                .retrieve()
                .body(OffResponse::class.java)
        }.getOrNull()
        return response?.let { toCandidate(barcode, it) }
    }

    companion object {
        private const val BASE_URL = "https://world.openfoodfacts.org"
        const val USER_AGENT = "Tucker/1.0 (personal diet tracker; +https://github.com/skrymer/tucker)"

        /** ODbL attribution carried on every Candidate sourced from OFF. */
        const val SOURCE = "Open Food Facts"

        /**
         * Normalise an OFF product response into a [FoodCandidate], or `null` on a
         * miss (`status != 1`, absent product, or no usable name). Absent macros stay
         * absent; OFF per-100ml values are taken as per-100g (density 1.0).
         */
        fun toCandidate(barcode: String, response: OffResponse): FoodCandidate? {
            val product = response.product?.takeIf { response.status == 1 }
            val name = product?.productName?.takeIf { it.isNotBlank() }
            val n = product?.nutriments
            return name?.let {
                FoodCandidate(
                    name = it,
                    barcode = barcode,
                    proteinPer100g = n?.proteins100g,
                    carbsPer100g = n?.carbohydrates100g,
                    fatPer100g = n?.fat100g,
                    statedEnergyKcalPer100g = n?.energyKcal100g,
                    source = SOURCE,
                )
            }
        }
    }
}
