<script setup lang="ts">
// Who Tucker takes you to be, read from the backend rather than parsed in the
// browser: the SPA never holds the Access assertion (the /api proxy attaches it
// server-side), so there is nothing here to read an address out of.
//
// A failed read leaves the name off and keeps Sign out, which needs no backend.
// No error state on screen — a session that has really ended is caught upstream
// by the auth-gate plugin, which replaces the whole shell.
const { email, ready } = useMe()
onMounted(ready)
</script>

<template>
  <!-- A byline, not a section — see DESIGN.md "Identity byline". -->
  <p class="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted">
    <!-- `wrap-anywhere`, not `break-words`: as a flex item this span's
         min-content width is its floor, and only `overflow-wrap: anywhere`
         counts soft-wrap opportunities toward that. With `break-word` a long
         address overflows the line instead of wrapping — the very case the
         design promises to handle. -->
    <span v-if="email" class="wrap-anywhere">Signed in as {{ email }}</span>
    <UButton
      :to="SIGN_OUT_PATH"
      external
      color="neutral"
      variant="link"
      size="sm"
      icon="i-lucide-log-out"
    >
      Sign out
    </UButton>
  </p>
</template>
