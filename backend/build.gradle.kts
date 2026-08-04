import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.sql.DriverManager

buildscript {
    repositories { mavenCentral() }
    dependencies {
        // Lets the prepareJooqDatabase task open a JDBC connection to build the codegen schema.
        classpath("org.xerial:sqlite-jdbc:3.47.1.0")
    }
}

plugins {
    kotlin("jvm") version "2.2.21"
    kotlin("plugin.spring") version "2.2.21"
    id("org.springframework.boot") version "3.4.1"
    id("io.spring.dependency-management") version "1.1.7"
    id("io.gitlab.arturbosch.detekt") version "1.23.8"
    // Dumps the runtime OpenAPI spec to a file (`generateOpenApiDocs` task).
    // Used to sync `frontend/openapi/tucker.json` after API changes.
    id("org.springdoc.openapi-gradle-plugin") version "1.9.0"
}

group = "com.tucker"
version = "0.1.0"

// Align the Kotlin version Spring Boot's dependency management resolves with the plugin.
extra["kotlin.version"] = "2.2.21"

java {
    sourceCompatibility = JavaVersion.VERSION_21
}

repositories {
    mavenCentral()
}

// Classpath for the jOOQ code generator, run as a JavaExec task (no third-party plugin).
val jooqCodegen: Configuration by configurations.creating

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-jooq")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    // Verifies Cloudflare Access's signed assertion (ADR 0020). Resource server
    // only — Tucker never issues a token, it only ever checks one.
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.flywaydb:flyway-core")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.7.0")
    // Web Push transport for the Weekly-Review Reminder (ADR 0010). bcprov is the
    // crypto provider web-push signs the VAPID/ECDH payloads with.
    implementation("nl.martijndwars:web-push:5.1.1")
    implementation("org.bouncycastle:bcprov-jdk18on:1.78.1")
    runtimeOnly("org.xerial:sqlite-jdbc:3.47.1.0")

    "jooqCodegen"("org.jooq:jooq-codegen:3.19.16")
    "jooqCodegen"("org.xerial:sqlite-jdbc:3.47.1.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    // `springSecurity()` for the MockMvc the gate test builds by hand — it needs the
    // real filter chain, and must NOT inherit the good token every other test gets.
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
    testImplementation("org.mockito.kotlin:mockito-kotlin:5.4.0")
    testImplementation("org.testcontainers:testcontainers")
    testImplementation("org.testcontainers:junit-jupiter")
}

// --- jOOQ code generation -------------------------------------------------
// 1. prepareJooqDatabase: apply the migration SQL to a throwaway SQLite database,
//    so jOOQ generates from the real schema (not a parsed/interpreted guess).
// 2. generateJooq: run jOOQ's GenerationTool (JavaExec) against that database.

val jooqSchemaDb = layout.buildDirectory.file("jooq/schema.db")
val jooqGeneratedDir = layout.buildDirectory.dir("generated/jooq")

val prepareJooqDatabase by tasks.registering {
    val migrationDir = file("src/main/resources/db/migration")
    inputs.dir(migrationDir)
    outputs.file(jooqSchemaDb)
    doLast {
        val dbFile = jooqSchemaDb.get().asFile
        dbFile.parentFile.mkdirs()
        dbFile.delete()
        DriverManager.getConnection("jdbc:sqlite:${dbFile.absolutePath}").use { conn ->
            migrationDir.listFiles { f -> f.extension == "sql" }!!
                // By version *number*, the way Flyway orders them — not by name.
                // Lexicographically "V10__" sorts before "V1__" ('0' < '_'), so a
                // name sort quietly ran the tenth migration first, against an empty
                // database. It went unnoticed while every migration was single-digit
                // and failed the moment V10 arrived. The application was never
                // affected: Flyway parses the version and orders on that.
                .sortedBy { it.name.substringAfter("V").substringBefore("__").toInt() }
                .forEach { script ->
                    conn.createStatement().use { stmt ->
                        script.readText().split(";")
                            .map { it.trim() }
                            .filter { it.isNotEmpty() }
                            .forEach { stmt.execute(it) }
                    }
                }
        }
    }
}

val generateJooq by tasks.registering(JavaExec::class) {
    dependsOn(prepareJooqDatabase)
    classpath = jooqCodegen
    mainClass.set("org.jooq.codegen.GenerationTool")
    args(file("jooq-codegen.xml").absolutePath)
    inputs.file("jooq-codegen.xml")
    inputs.file(jooqSchemaDb)
    outputs.dir(jooqGeneratedDir)
}

sourceSets {
    main {
        java.srcDir(jooqGeneratedDir)
    }
}

tasks.named("compileKotlin") { dependsOn(generateJooq) }
tasks.named("compileJava") { dependsOn(generateJooq) }

// --- The non-production Access key (ADR 0020) -----------------------------
// One verification path in every environment: production points the decoder at
// Cloudflare's team JWKS, everything else at the committed set that ships in
// src/main/resources/access/jwks.json. Its private half deliberately lives
// outside every shipped tree — it is only ever needed to *mint*, which nothing
// in the image may do — so the tests are handed it here, and here alone.
// Provenance, and why committing it is safe: dev/access-key/README.md.
tasks.named<ProcessResources>("processTestResources") {
    from(file("../dev/access-key")) {
        include("signing-key.json")
        into("access")
    }
}

// The three settings have no defaults, so an app given none of them refuses to
// start rather than falling back to a key anyone can sign with. Every
// non-production boot path therefore states them; this is the one for a locally
// run app, which includes the `generateOpenApiDocs` fork below.
val devAccessArgs = listOf(
    "--tucker.access.issuer=https://access.tucker.invalid",
    "--tucker.access.audience=tucker-dev",
    "--tucker.access.jwk-set-uri=classpath:access/jwks.json",
    // V9 names the owner of a pre-multi-user database (issue #156) and is likewise
    // undefaulted, so a locally run app has to state it too. A local database is
    // normally empty, in which case V9 adopts nothing and never reads this.
    "--spring.flyway.placeholders.ownerEmail=owner@tucker.invalid",
)

// Note `--args=` on the command line *replaces* this list rather than appending to it, so
// `./gradlew bootRun --args='--server.port=9000'` drops the Access config and the app then
// refuses to start. Pass the three settings along too, or use environment variables.
tasks.named<org.springframework.boot.gradle.tasks.run.BootRun>("bootRun") {
    args(devAccessArgs)
}

// --------------------------------------------------------------------------

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_21
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

// --- Static analysis ------------------------------------------------------
// Detekt lints the Kotlin sources and fails the build on any finding.
// `detekt.yml` holds project overrides, layered on detekt's default ruleset.
detekt {
    buildUponDefaultConfig = true
    config.setFrom(files("detekt.yml"))
}

// detekt 1.23.8 bundles the Kotlin 2.0.21 compiler; the project's
// `kotlin.version` (2.2.21) must not leak onto detekt's own classpath.
configurations.matching { it.name == "detekt" }.all {
    resolutionStrategy.eachDependency {
        if (requested.group == "org.jetbrains.kotlin") {
            useVersion("2.0.21")
        }
    }
}

// That bundled compiler caps --jvm-target at 22, below the JDK the build may
// run on; pin detekt's analysis target to 21.
tasks.withType<io.gitlab.arturbosch.detekt.Detekt>().configureEach {
    jvmTarget = "21"
}

// --- OpenAPI spec generation ----------------------------------------------
// The springdoc Gradle plugin runs `bootRun`, hits the api-docs endpoint, and
// writes the spec straight into the frontend's committed copy. Run it after
// any controller change so the typed nuxt-open-fetch client stays in sync:
//   ./gradlew generateOpenApiDocs
// Uses port 8181 to avoid colliding with any locally running tucker-backend.
// Named once here because two tasks care about it: `generateOpenApiDocs` writes
// it, and `test` reads it back (OpenApiSnapshotTest, below).
val openApiSnapshotDir = file("../frontend/openapi")
val openApiSnapshotName = "tucker.json"
val openApiSnapshot = openApiSnapshotDir.resolve(openApiSnapshotName)

openApi {
    apiDocsUrl.set("http://localhost:8181/v3/api-docs")
    outputDir.set(openApiSnapshotDir)
    outputFileName.set(openApiSnapshotName)
    customBootRun {
        // `/v3/api-docs` is one of the two paths the Access gate leaves open, but the
        // app still has to *boot*, and it will not without Access config (ADR 0020).
        args.set(listOf("--server.port=8181") + devAccessArgs)
    }
}

// The default test task runs the fast in-JVM suite (no Docker required).
tasks.named<Test>("test") {
    useJUnitPlatform { excludeTags("e2e") }
    // OpenApiSnapshotTest reads the committed spec through java.io.File, which
    // Gradle cannot see. Undeclared, a change to the snapshot alone leaves the
    // backend bytecode identical, so :test comes back UP-TO-DATE or FROM-CACHE
    // and the guard never runs — skipped in precisely the case it exists for
    // (a hand-edited or badly-merged tucker.json, with no backend change to
    // invalidate anything). Declaring it makes that edit a cache miss.
    inputs.file(openApiSnapshot)
        .withPropertyName("committedOpenApiSpec")
        .withPathSensitivity(PathSensitivity.NONE)
}

// End-to-end tests run the real tucker-backend Docker image via Testcontainers.
// Excluded from the default build; run with `./gradlew e2eTest` after the image
// is built (`docker compose build backend`).
tasks.register<Test>("e2eTest") {
    description = "End-to-end tests against the tucker-backend Docker image."
    group = "verification"
    useJUnitPlatform { includeTags("e2e") }
    testClassesDirs = sourceSets["test"].output.classesDirs
    classpath = sourceSets["test"].runtimeClasspath
    shouldRunAfter("test")
    // docker-java (via Testcontainers) defaults to a Docker API version that
    // modern daemons reject; pin one they support.
    systemProperty("api.version", "1.43")
    environment("DOCKER_API_VERSION", "1.43")
}
