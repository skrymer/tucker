# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /build

# Wrapper + build scripts first, so the dependency layer caches across source changes.
COPY gradlew ./
COPY gradle gradle
COPY settings.gradle.kts build.gradle.kts gradle.properties jooq-codegen.xml ./
RUN chmod +x gradlew && ./gradlew --no-daemon --quiet dependencies || true

# Application sources.
COPY src src
RUN ./gradlew --no-daemon clean bootJar -x test

# ---- Runtime stage ----
FROM eclipse-temurin:21-jre AS runtime
WORKDIR /app

# Run as a non-root user; /data is owned by it so a fresh named volume inherits that.
RUN useradd --system --uid 1001 --create-home tucker \
    && mkdir -p /data && chown tucker:tucker /data

COPY --from=build --chown=tucker:tucker /build/build/libs/*.jar app.jar

# Build stamp (issue #117): baked from build args so GET /api/version can report
# the running build. Declared here, after the jar copy, so a changing GIT_SHA /
# BUILT_AT never busts the expensive Gradle build layers. Graceful defaults keep
# local/CI builds that pass no args from failing — they read as dev/unknown.
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV APP_VERSION=$APP_VERSION \
    GIT_SHA=$GIT_SHA \
    BUILT_AT=$BUILT_AT

USER tucker
ENV TUCKER_DB_PATH=/data/tucker.db
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
