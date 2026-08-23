package com.tucker.provider

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import com.tucker.domain.ProviderCapability
import com.tucker.domain.ProviderLookup
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.web.client.RestClient
import java.net.InetSocketAddress
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * The provider's HTTP request shape, exercised against a local stub standing in
 * for Open Food Facts — the same seam the smoke stack uses (issue #163). The
 * response *mapping* is pinned separately by [OpenFoodFactsMappingTest].
 */
class OpenFoodFactsProviderTest {

    private lateinit var server: HttpServer
    private val received = mutableListOf<String>()

    /**
     * A slack lower bound on the two 250 ms backoffs that separate three attempts
     * (a single attempt pays neither). Deliberately under the true 500 ms — the
     * assertion only needs to tell "asked again" from "gave up at once", and a
     * tight bound would flake.
     */
    private val minimumRetryDelay: Duration = Duration.ofMillis(400)

    /** The `fields=`-trimmed shape OFF returns for a real product. */
    private val productJson = """
        {"code":"3017620422003","status":1,"status_verbose":"product found",
         "product":{"product_name":"Nutella",
                    "nutriments":{"proteins_100g":6.3,"carbohydrates_100g":57.5,
                                  "fat_100g":30.9,"energy-kcal_100g":539}}}
    """.trimIndent()

    @BeforeEach
    fun startStub() {
        server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0).apply {
            createContext("/") { exchange -> respond(exchange) }
            start()
        }
    }

    /** What the stub answers. Defaults to the product above; overridden per test. */
    private var response: Pair<Int, String> = 200 to productJson

    /** How long the stub dawdles before answering — for the too-slow Provider. */
    private var latency: Duration = Duration.ZERO

    private fun respond(exchange: HttpExchange) {
        received += exchange.requestURI.toString()
        Thread.sleep(latency.toMillis())
        val (status, payload) = response
        val body = payload.toByteArray()
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(status, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
    }

    @AfterEach
    fun stopStub() = server.stop(0)

    private fun provider(
        // Mirrors the production defaults, so the retry window a test sees is the
        // one real deployments get.
        readTimeout: Duration = Duration.ofSeconds(4),
        port: Int = server.address.port,
    ) = OpenFoodFactsProvider(
        RestClient.builder(),
        "http://127.0.0.1:$port",
        Duration.ofSeconds(2),
        readTimeout,
    )

    @Test
    fun `looks the barcode up against the configured base URL`() {
        val result = provider().lookupByBarcode("3017620422003")

        assertEquals(1, received.size, "the configured host should have been called exactly once")
        val found = assertIs<ProviderLookup.Found>(result)
        assertEquals("Nutella", found.candidate.name)
    }

    @Test
    fun `a Provider answering with a server error reaches no verdict`() {
        // Nothing was learned about the product, so calling this a miss would tell
        // the user it does not exist (issue #164).
        response = 503 to """{"error":"service unavailable"}"""

        assertEquals(ProviderLookup.Inconclusive, provider().lookupByBarcode("3017620422003"))
    }

    @Test
    fun `a Provider answering 404 has never heard of the product, and is asked only once`() {
        // OFF answers a genuine miss with 404. That is a verdict, not a failure, so
        // re-asking cannot change it — it only triples load on a Provider that
        // IP-bans abusive callers.
        response = 404 to """{"code":"7612349876500","status":0,"status_verbose":"product not found"}"""

        assertEquals(ProviderLookup.Missing, provider().lookupByBarcode("7612349876500"))
        assertEquals(1, received.size, "a verdict must not be retried")
    }

    @Test
    fun `a Provider too slow to answer reaches no verdict, and is not asked again`() {
        // The retries exist for name resolution, which fails in milliseconds and
        // succeeds on the immediate retry. Slowness is the opposite shape: asking
        // a Provider that is already too slow just spends the budget twice more.
        latency = Duration.ofMillis(300)

        val result = provider(readTimeout = Duration.ofMillis(80)).lookupByBarcode("3017620422003")

        assertEquals(ProviderLookup.Inconclusive, result)
        assertEquals(1, received.size, "slowness must not be retried")
    }

    @Test
    fun `a Provider that cannot be reached at all is asked again before giving up`() {
        // Why the retries exist: the JDK's cold in-container name resolution
        // fails in milliseconds and succeeds on the immediate retry (issue #163).
        // Deleting them to "simplify" the policy would reintroduce that failure.
        val deadPort = server.address.port
        server.stop(0)

        val startedAt = System.nanoTime()
        val result = provider(port = deadPort).lookupByBarcode("3017620422003")
        val elapsed = Duration.ofNanos(System.nanoTime() - startedAt)

        assertEquals(ProviderLookup.Inconclusive, result)
        // A refused connection to loopback returns almost instantly, so anything
        // near the backoff total can only mean it was asked more than once.
        assertTrue(
            elapsed >= minimumRetryDelay,
            "expected repeated attempts spaced by backoff, but gave up after $elapsed",
        )
    }

    @Test
    fun `a Provider slow enough to spend the budget is not asked again`() {
        // The retries exist for failures that cost milliseconds. Once an attempt
        // has spent the budget there is no room for another inside the client's
        // cap, so retrying would only produce an answer nobody is still waiting
        // for — the "server reaches a verdict first" rule (ADR 0007, issue #164).
        // Connection-refused is retryable *in kind*, so only the budget can stop it.
        val deadPort = server.address.port
        server.stop(0)

        // A read timeout this long leaves no room for a second attempt inside the
        // budget, so the retries must give way rather than overrun it.
        val startedAt = System.nanoTime()
        val result = provider(readTimeout = Duration.ofSeconds(7), port = deadPort)
            .lookupByBarcode("3017620422003")
        val elapsed = Duration.ofNanos(System.nanoTime() - startedAt)

        assertEquals(ProviderLookup.Inconclusive, result)
        assertTrue(
            elapsed < minimumRetryDelay,
            "expected the budget to stop the retries, but it kept going for $elapsed",
        )
    }

    @Test
    fun `a retry that could not even finish its own backoff is not attempted`() {
        // The budget has to cover the *whole* retry — its backoff as well as the
        // attempt after it — so the room left is compared against elapsed time
        // plus a backoff, not minus one. Timeouts of 2s + 4.9s leave a 100 ms
        // retry window inside the 7s budget: positive, but under one 250 ms
        // backoff, so the sleep alone would overrun it before OFF was re-asked.
        val deadPort = server.address.port
        server.stop(0)

        val startedAt = System.nanoTime()
        val result = provider(readTimeout = Duration.ofMillis(4900), port = deadPort)
            .lookupByBarcode("3017620422003")
        val elapsed = Duration.ofNanos(System.nanoTime() - startedAt)

        assertEquals(ProviderLookup.Inconclusive, result)
        assertTrue(
            elapsed < minimumRetryDelay,
            "expected a window narrower than one backoff to stop the retries, " +
                "but it kept going for $elapsed",
        )
    }

    @Test
    fun `a record Tucker cannot use is a miss, not a reason to try again`() {
        // Open Food Facts is crowd-sourced, so a product can carry values the
        // domain refuses outright — a negative macro, say. The Provider *answered*;
        // it simply has nothing usable. Reporting that as "couldn't reach it" would
        // tell the user to rescan a product that will fail identically forever,
        // which is the same inverted advice issue #164 exists to prevent.
        response = 200 to """
            {"code":"3017620422003","status":1,
             "product":{"product_name":"Dodgy entry",
                        "nutriments":{"proteins_100g":-1.0,"carbohydrates_100g":2.0,
                                      "fat_100g":3.0}}}
        """.trimIndent()

        assertEquals(ProviderLookup.Missing, provider().lookupByBarcode("3017620422003"))
    }

    @Test
    fun `an empty body is OFF saying nothing, not OFF saying no`() {
        // A 204 carries no product and no verdict. Read as a miss it would send
        // the user to manual entry for a barcode OFF may well know — the
        // inverted advice issue #164 exists to prevent.
        response = 204 to ""

        assertEquals(ProviderLookup.Inconclusive, provider().lookupByBarcode("3017620422003"))
        // Settled, though — OFF answered. Re-asking would not fill an empty body
        // in, and OFF IP-bans callers that hammer it.
        assertEquals(1, received.size, "an answered request must not be retried")
    }

    @Test
    fun `declares the barcode lookup the Check and Add-Food flows select it for`() {
        // The chain picks Providers by capability, so an empty set here takes OFF
        // out of every lookup without any of them failing.
        assertEquals(setOf(ProviderCapability.BARCODE_LOOKUP), provider().capabilities)
    }

    @Test
    fun `asks OFF for only the fields it consumes`() {
        // The full product document is ~150 KB of data Tucker never reads, and
        // fetching it swings the response past the read timeout (issue #163).
        provider().lookupByBarcode("3017620422003")

        assertEquals(
            "/api/v2/product/3017620422003.json?fields=product_name,nutriments",
            received.single(),
        )
    }
}
