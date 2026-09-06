<script setup lang="ts">
import { isDestinationActive, visibleDestinations } from '~/utils/navigation'

// Awaited here rather than in the layout: the nav and the page are siblings in
// one Suspense boundary, so this read overlaps the page's own fetches instead of
// being serialized ahead of them, and the tab bar still paints in its final
// shape. It follows that `tracksCalories` is settled for any *template*, but a
// page reading it in `setup` would race.
const { tracksCalories, load } = useCalorieTracking()
await load()

const destinations = computed(() => visibleDestinations(tracksCalories.value))

// The three anchor treatments, named once: the rail's two differ only in weight,
// and the tab bar's has to match the More button beside it exactly.
const railLink =
  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-elevated hover:text-default aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary'
const railPrimaryLink = `${railLink} font-medium`
const tab =
  'flex flex-1 flex-col items-center gap-1 py-2 text-xs font-medium text-muted transition-colors aria-[current=page]:text-primary'

// The overflow behind a sheet, on phone only — the side nav lays the same
// destinations out in place, so this sheet has no desktop trigger to open it.
// The button stands in for whichever destination is open, so the bar still
// answers "where am I" on /foods, /check and /profile.
function useMoreSheet() {
  const open = ref(false)
  const route = useRoute()
  const holdsCurrentPage = computed(() =>
    destinations.value.overflow.some((d) =>
      isDestinationActive(d.to, route.path),
    ),
  )
  return { open, holdsCurrentPage }
}
const { open: moreOpen, holdsCurrentPage: moreHoldsCurrentPage } =
  useMoreSheet()
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
        v-for="destination in destinations.primary"
        :key="destination.to"
        :destination="destination"
        :anchor-class="railPrimaryLink"
        icon-class="size-5 shrink-0"
      />
    </div>
    <!-- The same overflow the phone bar puts behind a sheet, laid out in place:
         a side nav has the room, and a menu that hides three links from a
         column with space for them buys nothing. -->
    <div
      role="group"
      aria-labelledby="side-nav-more"
      class="mt-2 border-t border-default p-3"
    >
      <p id="side-nav-more" class="px-3 pb-1 text-xs font-medium text-dimmed">
        More
      </p>
      <NavLink
        v-for="destination in destinations.overflow"
        :key="destination.to"
        :destination="destination"
        :anchor-class="railLink"
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
      v-for="destination in destinations.primary"
      :key="destination.to"
      :destination="destination"
      :anchor-class="tab"
      icon-class="size-5"
    />
    <button
      type="button"
      :aria-current="moreHoldsCurrentPage ? 'page' : undefined"
      :class="tab"
      @click="moreOpen = true"
    >
      <UIcon name="i-lucide-menu" class="size-5" />
      <span>More</span>
    </button>
  </nav>

  <ResponsiveOverlay v-model:open="moreOpen" title="More">
    <ul role="list" class="divide-y divide-default">
      <li v-for="destination in destinations.overflow" :key="destination.to">
        <NavLink
          :destination="destination"
          anchor-class="flex items-center gap-3 py-3 font-medium text-default aria-[current=page]:text-primary"
          icon-class="size-5 shrink-0 text-muted"
          @chosen="moreOpen = false"
        />
      </li>
    </ul>
  </ResponsiveOverlay>
</template>
