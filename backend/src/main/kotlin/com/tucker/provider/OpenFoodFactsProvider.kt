package com.tucker.provider

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import com.tucker.domain.FoodCandidate
import com.tucker.domain.NutritionProvider
import com.tucker.domain.ProviderCapability
import com.tucker.domain.ProviderLookup
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.event.EventListener
import org.springframework.http.HttpHeaders
import org.springframework.http.client.SimpleClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientException
import java.net.ConnectException
import java.net.InetAddress
import java.net.URI
import java.net.UnknownHostException
import java.time.Duration

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
 * callers), ODbL attribution via the `source`.
 *
 * OFF answering `404` is a **verdict** — it has never heard of the barcode — and
 * yields [ProviderLookup.Missing] on the first ask. A timeout, rate limit, server
 * error or unreadable body settles nothing and yields
 * [ProviderLookup.Inconclusive], so the chain can fall through *and still
 * remember* that this Provider never answered (issue #164).
 */
@Component
class OpenFoodFactsProvider(
    builder: RestClient.Builder,
    @Value("\${$BASE_URL_PROPERTY:$DEFAULT_BASE_URL}") private val baseUrl: String,
    @Value("\${$CONNECT_TIMEOUT_PROPERTY:$DEFAULT_CONNECT_TIMEOUT}") connectTimeout: Duration,
    @Value("\${$READ_TIMEOUT_PROPERTY:$DEFAULT_READ_TIMEOUT}") readTimeout: Duration,
) : NutritionProvider {

    /**
     * The latest a *retry* may start and still leave a full attempt's worth of
     * timeout inside [TOTAL_BUDGET]. Negative when an operator has raised the
     * timeouts past the budget, which simply means no retries — the right answer,
     * since one attempt already fills it. See [canRetry].
     */
    private val latestRetryStartNanos: Long =
        (TOTAL_BUDGET - connectTimeout - readTimeout).toNanos()

    private val client: RestClient = builder
        .baseUrl(baseUrl)
        .defaultHeader(HttpHeaders.USER_AGENT, USER_AGENT)
        // Use the classic HttpURLConnection factory: the JDK HttpClient's NIO
        // async DNS intermittently throws UnresolvedAddressException on the cold
        // request to OFF in-container. The explicit timeouts are ADR 0006's
        // "per-Provider timeout → fall-through".
        .requestFactory(requestFactory(connectTimeout, readTimeout))
        .build()

    override val capabilities: Set<ProviderCapability> = setOf(ProviderCapability.BARCODE_LOOKUP)

    /**
     * Pre-warm the OFF host's DNS on startup. The JDK's *first* name resolution
     * in a container intermittently fails with `UnresolvedAddressException`; once
     * warm it is reliable. Resolving ahead of the first user scan moves that cold
     * failure off the request path. Best-effort and off-thread — a failure here
     * never blocks startup, and a real lookup still falls through gracefully.
     */
    @EventListener(ApplicationReadyEvent::class)
    fun prewarmDns() {
        Thread({ resolveHostUntilWarm() }, "off-dns-prewarm").apply {
            isDaemon = true
            start()
        }
    }

    private fun resolveHostUntilWarm() {
        val host = runCatching { URI(baseUrl).host }.getOrNull()
        if (host == null) {
            log.warn("No host in the configured Open Food Facts base URL '{}'; skipping DNS pre-warm", baseUrl)
            return
        }
        repeat(PREWARM_ATTEMPTS) { attempt ->
            val resolved = runCatching { InetAddress.getAllByName(host) }
            if (resolved.isSuccess) {
                log.info("Open Food Facts DNS pre-warmed after {} attempt(s)", attempt + 1)
                return
            }
            log.warn("Open Food Facts DNS pre-warm attempt {} failed", attempt + 1, resolved.exceptionOrNull())
            runCatching { Thread.sleep(PREWARM_BACKOFF.toMillis()) }
        }
    }

    /**
     * Ask OFF, retrying only while nothing has been settled and the budget holds.
     * The JDK's name resolution intermittently fails (`UnknownHostException`) once
     * the positive DNS cache entry expires between scans; the immediate retry
     * succeeds (and is only possible because negative DNS caching is disabled —
     * see the companion). Once the attempts are exhausted nothing was learned,
     * which is [ProviderLookup.Inconclusive] and *not* a miss (issue #164).
     */
    override fun lookupByBarcode(barcode: String): ProviderLookup {
        val startedAt = System.nanoTime()
        for (attempt in 0 until MAX_ATTEMPTS) {
            val settled = ask(barcode, attempt)
            if (settled != null) return settled
            if (!canRetry(barcode, attempt, System.nanoTime() - startedAt)) break
            runCatching { Thread.sleep(RETRY_BACKOFF.toMillis()) }
        }
        return ProviderLookup.Inconclusive
    }

    /**
     * Whether another attempt is allowed: one is left, *and* it could still finish
     * inside [TOTAL_BUDGET].
     *
     * The budget is enforced here rather than merely documented because the only
     * failures worth retrying are name-resolution ones, and the JDK bounds
     * `connect` and `read` but never the resolver itself — `setConnectTimeout`
     * applies to `Socket.connect`, after `getaddrinfo` has already returned. Three
     * attempts against a slow resolver could therefore outlast the client's 8 s
     * cap even though every individual leg is bounded, which is exactly the
     * "server answers first" invariant ADR 0007 depends on (issue #164).
     *
     * A single attempt against a pathological resolver can still exceed the
     * budget; nothing short of a different HTTP client can bound that. What this
     * prevents is *multiplying* it by [MAX_ATTEMPTS].
     */
    private fun canRetry(barcode: String, attempt: Int, elapsedNanos: Long): Boolean {
        if (attempt >= MAX_ATTEMPTS - 1) return false
        val roomForAnother = elapsedNanos + RETRY_BACKOFF.toNanos() <= latestRetryStartNanos
        if (!roomForAnother) {
            log.warn(
                "Open Food Facts lookup for barcode {} spent its budget after {} attempt(s); no verdict reached",
                barcode, attempt + 1,
            )
        }
        return roomForAnother
    }

    /**
     * One call to OFF: what it settled, or `null` when it settled nothing and the
     * failure is the kind another attempt could fix.
     */
    private fun ask(barcode: String, attempt: Int): ProviderLookup? = try {
        classify(
            barcode,
            client.get()
                .uri("/api/v2/product/{barcode}.json?fields=$FIELDS", barcode)
                .retrieve()
                .body(OffResponse::class.java),
        )
    } catch (e: HttpClientErrorException.NotFound) {
        // OFF's answer for "never heard of it". A verdict, so asking again cannot
        // change it — and every extra ask is load on a Provider that IP-bans.
        log.debug("Open Food Facts has no product for barcode {}", barcode, e)
        ProviderLookup.Missing
    } catch (e: RestClientException) {
        // Only "is this failure transient" is decided here. How many attempts are
        // left, and whether the budget allows another, belongs to the loop — one
        // owner per rule, so neither can quietly contradict the other.
        val transient = worthAskingAgain(e)
        log.warn(
            "Open Food Facts lookup for barcode {} failed (attempt {}/{}){}",
            barcode, attempt + 1, MAX_ATTEMPTS,
            if (transient && attempt < MAX_ATTEMPTS - 1) ", retrying" else "; no verdict reached", e,
        )
        if (transient) null else ProviderLookup.Inconclusive
    }

    /**
     * Whether the failure is the millisecond-fast kind the retries were built for
     * — the JDK's cold name resolution, and a connection refused before anything
     * was sent — where asking again immediately tends to succeed.
     *
     * Slowness, a rate limit and a server error are deliberately excluded. They
     * are not blips: re-asking cannot change them inside the budget, and it
     * multiplies load on a Provider that IP-bans abusive callers (issue #164).
     */
    private fun worthAskingAgain(failure: RestClientException): Boolean =
        generateSequence(failure as Throwable) { it.cause }
            .take(CAUSE_DEPTH)
            .any { it is UnknownHostException || it is ConnectException }

    /** A body OFF actually returned, read as a verdict. */
    private fun classify(barcode: String, body: OffResponse?): ProviderLookup {
        // An empty body is not OFF saying "no": it is OFF saying nothing.
        if (body == null) return ProviderLookup.Inconclusive
        return readCandidate(barcode, body)
            ?.let { ProviderLookup.Found(it) }
            ?: ProviderLookup.Missing
    }

    /**
     * Normalise a product OFF returned, or `null` when Tucker can make nothing of
     * it.
     *
     * Open Food Facts is crowd-sourced, so a record can carry values the domain
     * refuses outright — a negative macro, say — and [FoodCandidate] rejects those
     * by construction. That must not escape as a throw: the Provider *answered*,
     * so the honest outcome is [ProviderLookup.Missing]. Letting it propagate
     * would reach the chain's catch-all and be read as "nobody could be asked",
     * which tells the user to rescan a product that will fail identically every
     * time — the same inverted advice issue #164 exists to prevent, pointing the
     * other way.
     */
    private fun readCandidate(barcode: String, body: OffResponse): FoodCandidate? =
        runCatching { toCandidate(barcode, body) }
            .onFailure {
                log.warn(
                    "Open Food Facts returned nutrition Tucker can't use for barcode {}; treating it as a miss",
                    barcode, it,
                )
            }
            .getOrNull()

    companion object {
        private val log = LoggerFactory.getLogger(OpenFoodFactsProvider::class.java)

        /**
         * The provider's origin, as operator config (ADR 0006 — the Provider set
         * is a deployment choice, not code). Defaulting to the live host keeps
         * production behaviour unchanged; the smoke stack overrides it to a local
         * stub so CI never depends on OFF's health (issue #163).
         */
        const val BASE_URL_PROPERTY = "tucker.providers.open-food-facts.base-url"
        const val DEFAULT_BASE_URL = "https://world.openfoodfacts.org"
        const val USER_AGENT = "Tucker/1.0 (personal diet tracker; +https://github.com/skrymer/tucker)"

        /**
         * OFF's field selector, naming exactly what [OffProduct] reads. Without it
         * OFF ships the whole product document — ~150 KB to extract a name and
         * four numbers — and the response time swings past [DEFAULT_READ_TIMEOUT], which
         * silently degrades every scan to manual entry (issue #163).
         */
        private const val FIELDS = "product_name,nutriments"

        /** ODbL attribution carried on every Candidate sourced from OFF. */
        const val SOURCE = "Open Food Facts"

        /**
         * The per-attempt timeouts, operator config alongside the base URL.
         *
         * They must leave the whole lookup inside the client's 8 s cap so that
         * **the server always reaches a verdict first** and the browser never has
         * to invent one from silence (ADR 0007, issue #164):
         *
         * ```
         * retry window (TOTAL_BUDGET − CONNECT − READ = 1s) + CONNECT 2s + READ 4s = 7s
         * ```
         *
         * [canRetry] enforces that rather than trusting this comment — raise a
         * timeout and the retry window narrows to match, so the retries give way
         * instead of overrunning. The window has to comfortably exceed the two
         * backoffs it has to fit (2 × 250 ms), or `Thread.sleep`'s overshoot would
         * quietly cost the third attempt and weaken the DNS mitigation.
         */
        const val CONNECT_TIMEOUT_PROPERTY = "tucker.providers.open-food-facts.connect-timeout"
        const val READ_TIMEOUT_PROPERTY = "tucker.providers.open-food-facts.read-timeout"
        const val DEFAULT_CONNECT_TIMEOUT = "2s"
        const val DEFAULT_READ_TIMEOUT = "4s"

        /** What the whole lookup, retries included, is allowed to cost. */
        private val TOTAL_BUDGET: Duration = Duration.ofSeconds(7)

        private const val PREWARM_ATTEMPTS = 5
        private val PREWARM_BACKOFF: Duration = Duration.ofMillis(500)

        private const val MAX_ATTEMPTS = 3
        private val RETRY_BACKOFF: Duration = Duration.ofMillis(250)

        /** How far down a failure's cause chain to look for a retryable cause. */
        private const val CAUSE_DEPTH = 5

        /** A timeout-bounded, blocking-IO request factory for the OFF client. */
        private fun requestFactory(
            connectTimeout: Duration,
            readTimeout: Duration,
        ): SimpleClientHttpRequestFactory =
            SimpleClientHttpRequestFactory().apply {
                setConnectTimeout(connectTimeout)
                setReadTimeout(readTimeout)
            }

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
