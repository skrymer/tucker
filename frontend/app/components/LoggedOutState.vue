<script setup lang="ts"></script>

<template>
  <div class="flex flex-col items-center gap-3 py-12 text-center">
    <UIcon name="i-lucide-lock" class="size-10 text-error" aria-hidden />
    <h2 class="text-lg font-semibold text-default">You've been logged out</h2>
    <p class="max-w-xs text-sm text-muted">Log back in to keep tracking.</p>
    <!-- A plain external navigation, not a router `to` link: the
         precached shell (ADR 0011) would just re-open on any SPA route,
         so this must reach `/api/*`, the one path Workbox always sends to
         the network, for Cloudflare Access's login challenge to run. -->
    <UButton
      to="/api/version"
      external
      color="error"
      variant="outline"
      size="sm"
    >
      Log back in
    </UButton>
  </div>
</template>
