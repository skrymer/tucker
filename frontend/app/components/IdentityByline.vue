<script setup lang="ts">
// Who Tucker takes you to be, read from the backend rather than parsed in the
// browser: the SPA never holds the Access assertion (the /api proxy attaches it
// server-side), so there is nothing here to read an address out of.
//
// Deliberately not useOptionalFetch, which is otherwise the right shape: it
// folds a 404 into "absent, and that's expected". Here a 404 means the backend
// predates /api/me — a partial deploy, the exact fault BuildTag exists to make
// visible — and swallowing it would lose the one failure worth hearing about.
function useSignedInAs() {
  const { $api } = useNuxtApp()
  const email = ref<string | null>(null)

  onMounted(async () => {
    try {
      email.value = (await $api('/api/me')).email
    } catch (error) {
      // Leave it null: the byline drops the name and keeps Sign out, which
      // needs no backend. No error state on screen — a session that has really
      // ended is caught upstream by the auth-gate plugin, which replaces the
      // whole shell. Logged rather than swallowed, because the only other
      // symptom is a name quietly missing, which reads as a design choice.
      console.warn('Could not read the signed-in address', error)
    }
  })

  return email
}

const email = useSignedInAs()
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
