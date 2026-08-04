package com.tucker.e2e

import com.tucker.security.ACCESS_ASSERTION_HEADER
import com.tucker.security.AccessTokens
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * End-to-end test: starts the real `tucker-backend` Docker image as a container
 * and drives its live HTTP API over a real socket. Proves the deployable
 * artifact boots, applies the Flyway schema, and serves requests.
 *
 * Prerequisite: the image must be built — `docker compose build backend`.
 * Excluded from the default `test` task; run with `./gradlew e2eTest`.
 */
@Tag("e2e")
@Testcontainers
class ApiEndToEndTest {

    companion object {
        private const val APP_PORT = 8080

        @Container
        @JvmStatic
        val tucker: GenericContainer<*> =
            GenericContainer(DockerImageName.parse("tucker-backend:latest"))
                .withExposedPorts(APP_PORT)
                // The image has no Access settings baked in and refuses to start without
                // them (ADR 0020), so point it at the committed non-production key that
                // ships in its own resources. The readiness probe below is `/v3/api-docs`,
                // one of the two paths the gate leaves open — gate that by mistake and the
                // container simply never becomes ready, which looks nothing like a 401.
                .withEnv("TUCKER_ACCESS_ISSUER", AccessTokens.ISSUER)
                .withEnv("TUCKER_ACCESS_AUDIENCE", AccessTokens.AUDIENCE)
                .withEnv("TUCKER_ACCESS_JWK_SET_URI", AccessTokens.JWK_SET_URI)
                // Undefaulted too (issue #156), so the image refuses to start without it.
                // The container's database is brand new, so V9 finds nothing to adopt and
                // never writes this row — the first request provisions the real User.
                .withEnv("TUCKER_OWNER_EMAIL", "owner@tucker.invalid")
                .waitingFor(Wait.forHttp("/v3/api-docs").forStatusCode(200))
    }

    private val http: HttpClient = HttpClient.newHttpClient()

    private fun baseUrl(): String = "http://${tucker.host}:${tucker.getMappedPort(APP_PORT)}"

    /**
     * The real socket carries the real header — nothing here is a test double, so this
     * proves the deployed image verifies an assertion, not just that the code compiles.
     */
    private fun HttpRequest.Builder.signedIn(): HttpRequest.Builder =
        header(ACCESS_ASSERTION_HEADER, AccessTokens.mint())

    private fun post(path: String, body: String): HttpResponse<String> =
        http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + path))
                .header("Content-Type", "application/json")
                .signedIn()
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun get(path: String): HttpResponse<String> =
        http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + path)).signedIn().GET().build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    @Test
    fun `the running image serves the food, entry and summary API end to end`() {
        val createFood = post(
            "/api/foods",
            """{"name":"Banana","caloriesPer100g":89.0,"proteinPer100g":1.1}""",
        )
        assertEquals(201, createFood.statusCode(), "create food: ${createFood.body()}")
        val foodId = Regex(""""id":(\d+)""").find(createFood.body())!!.groupValues[1]

        val logEntry = post(
            "/api/entries/weighed",
            """{"date":"2026-05-22","foodId":$foodId,"grams":120.0}""",
        )
        assertEquals(201, logEntry.statusCode(), "log entry: ${logEntry.body()}")

        val summary = get("/api/summary?date=2026-05-22")
        assertEquals(200, summary.statusCode())
        assertTrue(summary.body().contains("\"caloriesConsumed\""))

        // An unknown food id must still come back as a clean 404, not a 500.
        assertEquals(404, get("/api/foods/999999").statusCode())
    }

    /** The deployed image, not just the code, refuses a caller who presents nothing. */
    @Test
    fun `the running image refuses a request carrying no Access assertion`() {
        val refused = http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/foods")).GET().build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(401, refused.statusCode(), "expected the gate to refuse: ${refused.body()}")
    }

    /**
     * MockMvc records `sendError` and stops, so it never performs the ERROR dispatch that
     * Spring Security also filters — which makes this reachable only over a real socket.
     * The door being open has to mean the status is honest, or an operator diagnosing an
     * outage reads "rejecting me" when the truth is "up, and you asked wrongly".
     */
    @Test
    fun `an error on an open door reports its own status, not a refusal`() {
        val wrongMethod = http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/version"))
                .POST(HttpRequest.BodyPublishers.noBody())
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(405, wrongMethod.statusCode(), "expected method-not-allowed, not 401")
    }
}
