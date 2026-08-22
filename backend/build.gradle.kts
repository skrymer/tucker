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

// Classpath for the pitest mutation-testing runner, likewise run as a JavaExec task.
val pitest: Configuration by configurations.creating

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

    "pitest"("org.pitest:pitest-command-line:1.25.9")
    "pitest"("org.pitest:pitest-junit5-plugin:1.2.3")

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
                // Order by version, the way Flyway does. A name sort puts "V10__"
                // before "V1__" ('0' < '_'), running the tenth migration against an
                // empty database — unnoticed while every version was single-digit.
                // Only codegen was affected; Flyway orders on the version it parses.
                //
                // Zero-padded rather than `.toInt()`, so the dotted and underscored
                // forms Flyway also accepts (`V10_1__`, `V2.1__` — the ordinary idiom
                // for a hotfix on top of an existing version) sort correctly instead
                // of failing the whole build with a NumberFormatException naming
                // neither the file nor the reason.
                .sortedBy { file ->
                    file.name.substringAfter("V").substringBefore("__")
                        .split('.', '_').joinToString(".") { it.padStart(5, '0') }
                }
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

// --- Mutation testing -----------------------------------------------------
// pitest rewrites the compiled bytecode one mutant at a time and re-runs the
// tests that cover it; a mutant no test notices is a line no assertion pins.
// A local pre-PR gate driven by the /mutation-test skill, never a CI job — a
// surviving mutant needs a human verdict, not a threshold (ADR 0013).
//
// Run as a JavaExec against pitest's own CLI entry point, the way jOOQ codegen
// above is: the Gradle plugin's last release predates Gradle 9, while pitest
// itself is current. Scope it to the classes a change touched, or it sweeps the
// whole backend. Name each class and its nested types — a bare `Foo*` also
// matches every sibling whose name it prefixes:
//   ./gradlew mutationTest -PmutationTargets='com.tucker.domain.Goal,com.tucker.domain.Goal$*'
tasks.register<JavaExec>("mutationTest") {
    description = "Mutation testing (pitest) over the fast suite. Scope with -PmutationTargets."
    group = "verification"
    dependsOn("testClasses")
    classpath = pitest
    mainClass.set("org.pitest.mutationtest.commandline.MutationCoverageReport")

    val reportDir = layout.buildDirectory.dir("reports/pitest").get().asFile
    // jOOQ generates Java and everything hand-written here is Kotlin, so the two
    // land in different output directories. Offering pitest only the Kotlin one
    // makes "never mutate generated code" structural, rather than a package name
    // that has to be kept in step with jooq-codegen.xml.
    val generatedJava = sourceSets["main"].java.destinationDirectory.get().asFile
    val handWritten = sourceSets["main"].output.classesDirs.filter { it != generatedJava }

    args(
        "--reportDir", reportDir.absolutePath,
        "--targetClasses", providers.gradleProperty("mutationTargets").getOrElse("com.tucker.*"),
        "--targetTests", "com.tucker.*",
        // The Testcontainers suite needs the Docker image built and takes minutes;
        // pitest would re-run it per mutant. Dropped by the same @Tag the `test`
        // task filters on, so the two cannot drift.
        "--excludedGroups", "e2e",
        // The classes the Kotlin compiler emits for an inlined lambda — the
        // comparator behind `sortedBy`, for one. pitest's own Kotlin filter
        // (feature FKOTLIN, on by default) catches most compiler constructs but
        // not these.
        "--excludedClasses", "com.tucker.*\$\$inlined\$*",
        // Kotlin compiles a null assertion into every platform-type access.
        // Deleting one is a mutant of the compiler's work, not of Tucker's.
        // The flag *replaces* pitest's default list rather than adding to it,
        // so the logging frameworks it ships with are restated — a deleted log
        // line is not a behaviour change any test should be asked to notice.
        "--avoidCallsTo",
        "kotlin.jvm.internal.Intrinsics," +
            "java.util.logging,org.apache.log4j,org.slf4j,org.apache.commons.logging",
        "--sourceDirs", file("src/main/kotlin").absolutePath,
        "--classPath", sourceSets["test"].runtimeClasspath.joinToString(","),
        "--mutableCodePaths", handWritten.joinToString(","),
        "--outputFormats", "HTML,XML",
        "--timestampedReports", "false",
        // pitest's default, restated because raising it is the obvious way to
        // speed a sweep up and it would corrupt the result: every test shares one
        // SQLite file (src/test/resources/application.yml), so parallel minions
        // contend for it and report mutants killed by lock timeouts, not by
        // assertions.
        "--threads", "1",
    )

    // Nothing else clears the report, and the skill's triage step parses
    // mutations.xml — so a run that dies leaves the previous run's verdict on
    // disk looking exactly like a fresh one.
    doFirst { reportDir.deleteRecursively() }
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
