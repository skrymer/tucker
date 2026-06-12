# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:24-slim AS build
WORKDIR /build

# pnpm via corepack, pinned to the version used locally (writes the v9 lockfile).
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# The whole project is copied before install because our postinstall runs
# `nuxt prepare`, which needs the source present (node_modules and build outputs
# are excluded via .dockerignore). `pnpm build` emits the nitro node server to
# .output/server. A clean install each build keeps this simple and correct
# (ADR 0015 accepts the on-host build cost; GHCR is the documented next step).
COPY . .
RUN pnpm install --frozen-lockfile

# Build stamp (issue #117): baked into the client bundle at `nuxt build` via
# runtimeConfig.public (nuxt.config reads these from process.env), so the
# Profile footer can show the running build. Placed after install so a changing
# GIT_SHA only re-runs the build, not the dependency layer. Defaults degrade
# gracefully for local/CI builds that pass no args.
ARG APP_VERSION=dev
ARG GIT_SHA=unknown
ENV APP_VERSION=$APP_VERSION \
    GIT_SHA=$GIT_SHA
RUN pnpm build

# ---- Runtime stage ----
FROM node:24-slim AS runtime
WORKDIR /app

# Run as a non-root user (mirrors the backend image).
RUN useradd --system --uid 1001 --create-home tucker
COPY --from=build --chown=tucker:tucker /build/.output ./.output

USER tucker
# Bind to all interfaces inside the container; the runtime /api proxy reads
# TUCKER_API_UPSTREAM (set by docker-compose.prod.yml to http://backend:8080).
ENV NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    NODE_ENV=production
EXPOSE 3000
ENTRYPOINT ["node", ".output/server/index.mjs"]
