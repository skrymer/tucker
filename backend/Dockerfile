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

USER tucker
ENV TUCKER_DB_PATH=/data/tucker.db
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
