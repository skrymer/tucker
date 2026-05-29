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
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.flywaydb:flyway-core")
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.7.0")
    runtimeOnly("org.xerial:sqlite-jdbc:3.47.1.0")

    "jooqCodegen"("org.jooq:jooq-codegen:3.19.16")
    "jooqCodegen"("org.xerial:sqlite-jdbc:3.47.1.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit5")
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
                .sortedBy { it.name }
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
openApi {
    apiDocsUrl.set("http://localhost:8181/v3/api-docs")
    outputDir.set(file("../frontend/openapi"))
    outputFileName.set("tucker.json")
    customBootRun {
        args.set(listOf("--server.port=8181"))
    }
}

// The default test task runs the fast in-JVM suite (no Docker required).
tasks.named<Test>("test") {
    useJUnitPlatform { excludeTags("e2e") }
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
