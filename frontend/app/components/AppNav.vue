<script setup lang="ts">
import { navDestinations } from '~/utils/navigation'
</script>

<template>
  <!-- Desktop: a persistent side navigation. -->
  <nav
    data-testid="side-nav"
    aria-label="Primary"
    class="hidden lg:flex fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-default bg-default"
  >
    <div class="flex items-center gap-2 px-5 py-4">
      <UIcon name="i-lucide-salad" class="size-6 text-primary" />
      <span class="text-lg font-bold text-default">Tucker</span>
    </div>
    <div class="flex flex-col gap-1 p-3">
      <NavLink
        v-for="destination in navDestinations"
        :key="destination.to"
        :destination="destination"
        anchor-class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-elevated hover:text-default aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
        icon-class="size-5 shrink-0"
      />
    </div>
  </nav>

  <!-- Mobile: a bottom tab bar. -->
  <nav
    data-testid="bottom-nav"
    aria-label="Primary"
    class="fixed inset-x-0 bottom-0 z-40 flex lg:hidden border-t border-default bg-default pb-[env(safe-area-inset-bottom)]"
  >
    <NavLink
      v-for="destination in navDestinations"
      :key="destination.to"
      :destination="destination"
      anchor-class="flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-muted transition-colors aria-[current=page]:text-primary"
      icon-class="size-5"
    />
  </nav>
</template>
