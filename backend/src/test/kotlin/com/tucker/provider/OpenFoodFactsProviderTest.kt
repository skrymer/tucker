package com.tucker.provider

import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.web.client.RestClient
import java.net.InetSocketAddress
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

/**
 * The provider's HTTP request shape, exercised against a local stub standing in
 * for Open Food Facts — the same seam the smoke stack uses (issue #163). The
 * response *mapping* is pinned separately by [OpenFoodFactsMappingTest].
 */
class OpenFoodFactsProviderTest {

    private lateinit var server: HttpServer
    private val received = mutableListOf<String>()

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

    private fun respond(exchange: HttpExchange) {
        received += exchange.requestURI.toString()
        val body = productJson.toByteArray()
        exchange.responseHeaders.add("Content-Type", "application/json")
        exchange.sendResponseHeaders(200, body.size.toLong())
        exchange.responseBody.use { it.write(body) }
    }

    @AfterEach
    fun stopStub() = server.stop(0)

    private fun provider() =
        OpenFoodFactsProvider(RestClient.builder(), "http://127.0.0.1:${server.address.port}")

    @Test
    fun `looks the barcode up against the configured base URL`() {
        val candidate = provider().lookupByBarcode("3017620422003")

        assertEquals(1, received.size, "the configured host should have been called exactly once")
        assertNotNull(candidate)
        assertEquals("Nutella", candidate.name)
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
