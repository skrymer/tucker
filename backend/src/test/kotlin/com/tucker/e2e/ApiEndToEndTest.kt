package com.tucker.e2e

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
                .waitingFor(Wait.forHttp("/v3/api-docs").forStatusCode(200))
    }

    private val http: HttpClient = HttpClient.newHttpClient()

    private fun baseUrl(): String = "http://${tucker.host}:${tucker.getMappedPort(APP_PORT)}"

    private fun post(path: String, body: String): HttpResponse<String> =
        http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build(),
            HttpResponse.BodyHandlers.ofString(),
        )

    private fun get(path: String): HttpResponse<String> =
        http.send(
            HttpRequest.newBuilder(URI.create(baseUrl() + path)).GET().build(),
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
}
