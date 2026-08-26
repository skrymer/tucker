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
import java.net.CookieManager
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

        /** What `CookieCsrfTokenRepository` puts on the wire by default (ADR 0025). */
        private const val CSRF_COOKIE = "XSRF-TOKEN"
        private const val CSRF_HEADER = "X-XSRF-TOKEN"

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

    private val cookies = CookieManager()
    private val http: HttpClient = HttpClient.newBuilder().cookieHandler(cookies).build()

    private fun baseUrl(): String = "http://${tucker.host}:${tucker.getMappedPort(APP_PORT)}"

    /**
     * The real socket carries the real header — nothing here is a test double, so this
     * proves the deployed image verifies an assertion, not just that the code compiles.
     */
    private fun HttpRequest.Builder.signedIn(): HttpRequest.Builder =
        header(ACCESS_ASSERTION_HEADER, AccessTokens.mint())

    /**
     * The CSRF token, held the way a browser holds one (ADR 0025). A GET first, because the
     * token only arrives on a response.
     *
     * The cookie and header names are spelled out rather than shared with the backend: this
     * test reaches the image over a socket, and the wire contract is what it is asserting.
     */
    private val csrfToken: String by lazy {
        get("/api/version")
        checkNotNull(cookies.cookieStore.cookies.firstOrNull { it.name == CSRF_COOKIE }) {
            "the image handed out no $CSRF_COOKIE cookie"
        }.value
    }

    private fun post(path: String, body: String): HttpResponse<String> =
        http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + path))
                .header("Content-Type", "application/json")
                .header(CSRF_HEADER, csrfToken)
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

    /**
     * Everything the image put on the `XSRF-TOKEN` cookie except the token itself. Asserted
     * as a closed list so the two tests below pin the whole of ADR 0025's wire contract:
     * `SameSite=Strict` was specified there and pinned by nothing, and an `HttpOnly` that
     * crept in would blind the page JavaScript that has to read the token.
     */
    private fun HttpResponse<*>.csrfCookieAttributes(): List<String> =
        checkNotNull(
            headers().allValues("set-cookie").firstOrNull { it.startsWith("$CSRF_COOKIE=") },
        ) { "the image handed out no $CSRF_COOKIE cookie" }
            .split(';')
            .map { it.trim() }
            .drop(1)

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
     *
     * Carries a token but no assertion: the assertion is what this probes, and a CSRF
     * refusal would answer the wrong gate (ADR 0025).
     */
    @Test
    fun `an error on an open door reports its own status, not a refusal`() {
        val wrongMethod = http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/version"))
                .header(CSRF_HEADER, csrfToken)
                .POST(HttpRequest.BodyPublishers.noBody())
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(405, wrongMethod.statusCode(), "expected method-not-allowed, not 401")
    }

    /**
     * Behind the tunnel the backend is reached over plain HTTP, so `Secure` can only come
     * from the forwarded scheme (ADR 0025). Read off the raw `set-cookie` header rather than
     * the cookie store, because that is the wire contract a browser actually applies — and
     * because `CookieManager` would quietly drop a `Secure` cookie arriving over `http`
     * before this could see it.
     */
    @Test
    fun `the running image marks the CSRF cookie Secure when the request arrived over https`() {
        val forwarded = http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/version"))
                .header("X-Forwarded-Proto", "https")
                .GET()
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(listOf("Path=/", "Secure", "SameSite=Strict"), forwarded.csrfCookieAttributes())
    }

    /**
     * The other half of the derivation, and the half every other test here rests on: with no
     * scheme forwarded the cookie must *not* be `Secure`, or `CookieManager` would refuse to
     * send it back and every mutation below would fail the gate it exists to prove. A
     * hardcoded `secure(true)` satisfies the test above and fails this one.
     */
    @Test
    fun `the running image leaves Secure off the CSRF cookie when the request arrived over http`() {
        val direct = http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + "/api/version")).GET().build(),
            HttpResponse.BodyHandlers.ofString(),
        )
        assertEquals(listOf("Path=/", "SameSite=Strict"), direct.csrfCookieAttributes())
    }
}
