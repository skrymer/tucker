<script setup lang="ts"></script>

<template>
  <div class="flex flex-col items-center gap-3 py-12 text-center">
    <UIcon name="i-lucide-lock" class="size-10 text-error" aria-hidden />
    <h2 class="text-lg font-semibold text-default">You've been signed out</h2>
    <p class="max-w-xs text-sm text-muted">Sign back in to keep tracking.</p>
    <!-- A plain external navigation, not a router `to` link: the precached
         shell (ADR 0011) would just re-open on any SPA route. The path and the
         rule that keeps it reachable live together in app/utils/exits.ts. -->
    <UButton
      :to="SIGN_IN_PATH"
      external
      color="error"
      variant="outline"
      size="sm"
    >
      Sign back in
    </UButton>
  </div>
</template>
