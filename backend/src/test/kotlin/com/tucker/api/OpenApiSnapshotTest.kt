package com.tucker.api

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import java.io.File
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Guards the agreement between the spec the backend serves and the committed copy
 * the frontend types its client from.
 *
 * `frontend/openapi/tucker.json` is a snapshot, and `nuxt-open-fetch` types every
 * call site from it — not from the running backend. Keeping it current is a manual
 * two-command step, so a changed shape or error contract could land with the
 * snapshot stale and every suite still green: the backend suite tests the live
 * spec, the frontend suite tests the old committed one, and until this test nothing
 * compared them.
 *
 * A **new endpoint** was never the silent case — the frontend cannot typecheck a
 * call to an operation the generated client does not contain. A **changed shape**
 * on an existing endpoint is: the client keeps compiling against the old
 * description and is simply wrong about what arrives. That is the drift this
 * catches, and it is the same failure ADR 0023 removed one layer down — deriving
 * nullability automatically only helps if the derived spec reaches the client.
 *
 * One boundary to know before trusting a red. The committed copy is written by
 * `generateOpenApiDocs`' forked `bootRun`, which reads `src/main/resources/
 * application.yml`; this test reads the context built from `src/test/resources/
 * application.yml`, which **shadows** that file rather than layering onto it. Both
 * springdoc keys in main are spec-neutral today (`swagger-ui.path`,
 * `writer-with-default-pretty-printer`), which is the only reason the two agree. Add
 * a spec-affecting one — `default-produces-media-type`, `override-with-generic-response`
 * — and this test goes red against a committed spec that is *right about production*,
 * with regeneration a no-op. The fix then is to make the two contexts agree, by
 * mirroring the key into the test file or expressing it as a bean beside
 * [com.tucker.config.OpenApiNullabilityConfig]; it is never to hand-edit the
 * snapshot to match this context, which is how a genuinely stale spec gets a green
 * test.
 */
@SpringBootTest
@AutoConfigureMockMvc
class OpenApiSnapshotTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var objectMapper: ObjectMapper

    @Test
    fun `the committed spec the frontend types its client from is the one the backend serves`() {
        val served = mockMvc.servedSpec(objectMapper)
        val committed = committedSpec()

        // A floor against a vacuous pass. The assertion below is an equality, so one
        // side suffices: if the served spec describes paths and nothing differs, the
        // committed one carries them too.
        assertTrue(
            served.path("paths").size() > 0,
            "The served spec describes no paths — resolution failed, so a match proves nothing.",
        )

        assertEquals(
            emptyList(),
            specDifferences(committed, served),
            "The committed OpenAPI spec no longer describes what the backend serves, so the " +
                "generated client is wrong about this API. Regenerate it:\n" +
                "  cd backend  && ./gradlew generateOpenApiDocs\n" +
                "  cd frontend && pnpm exec nuxt prepare\n" +
                "and commit both the spec and whatever the regenerated client changes.\n" +
                "Differing:",
        )
    }

    private fun committedSpec(): JsonNode {
        val file = File(SNAPSHOT)
        assertTrue(
            file.isFile,
            "No committed spec at ${file.absolutePath}. This test resolves it relative to the " +
                "backend project directory, the same anchor `openApi.outputDir` writes it to.",
        )
        return objectMapper.readTree(file)
    }

    private companion object {
        /** Relative to the backend project directory, as `openApi.outputDir` is. */
        const val SNAPSHOT = "../frontend/openapi/tucker.json"
    }
}
