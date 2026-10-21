<script setup lang="ts">
// Wide because its charts need the room. A User who is not an Admin, or whose
// `/api/me` fails, meets the same 404 an unknown path does, so the page's
// existence tells them nothing (ADR 0039).
// Stryker disable next-line all: a compiler macro must stay a top-level statement
definePageMeta({
  wideColumn: true,
  middleware: async (to) => {
    const { isAdmin, ready } = useMe()
    await ready()
    if (isAdmin.value) return
    return abortNavigation(
      createError({
        statusCode: 404,
        statusMessage: `Page not found: ${to.fullPath}`,
        fatal: true,
      }),
    )
  },
})
</script>

<template>
  <div>
    <!-- The same breakpoint as the shell's side nav, where the Admin item lives. -->
    <p class="text-body text-muted lg:hidden">
      Metrics are built for a larger screen.
    </p>
    <section class="hidden flex-col gap-4 lg:flex">
      <header class="flex flex-col gap-1">
        <p class="text-eyebrow text-muted">Admin</p>
        <h1 class="text-h1 text-default">Metrics</h1>
      </header>
      <div class="flex flex-col items-center gap-3 py-12 text-center">
        <UIcon name="i-lucide-gauge" class="size-10 text-muted" aria-hidden />
        <h2 class="text-h2 text-highlighted">Nothing measured yet</h2>
        <p class="max-w-xs text-sm text-muted">
          Page timings appear here once Tucker starts recording them.
        </p>
      </div>
    </section>
  </div>
</template>
