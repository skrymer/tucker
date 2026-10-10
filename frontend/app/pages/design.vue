<script setup lang="ts">
// Living style guide for the "Vital" design system (frontend/DESIGN.md). Renders
// the real Nuxt UI components under the applied theme so the tokens can be seen
// and reviewed in one place. Not linked in the nav — reachable at /design.
// Presentation only; no domain logic, so no dedicated test (a gallery of already
// tested components).

const greenScale = [
  { step: '50', hex: '#effdf5' },
  { step: '100', hex: '#d9fbe8' },
  { step: '200', hex: '#b3f5d1' },
  { step: '300', hex: '#75edae' },
  { step: '400', hex: '#00dc82' },
  { step: '500', hex: '#00c16a' },
  { step: '600', hex: '#00a155' },
  { step: '700', hex: '#007f45' },
  { step: '800', hex: '#016538' },
  { step: '900', hex: '#0a5331' },
  { step: '950', hex: '#052e16' },
]

const coralScale = [
  { step: '50', hex: '#fff1ed' },
  { step: '100', hex: '#ffe0d6' },
  { step: '200', hex: '#ffc3b0' },
  { step: '300', hex: '#ff9e82' },
  { step: '400', hex: '#ff8460' },
  { step: '500', hex: '#ff6b4a' },
  { step: '600', hex: '#ed4e2c' },
  { step: '700', hex: '#c63c20' },
  { step: '800', hex: '#9e3220' },
  { step: '900', hex: '#7f2c1e' },
  { step: '950', hex: '#451208' },
]

const surfaces = [
  { name: 'Canvas', hex: '#eff6f1', note: 'page wash' },
  { name: 'Card', hex: '#ffffff', note: '--ui-bg' },
  { name: 'Muted', hex: '#f1f8f3', note: '--ui-bg-muted' },
  { name: 'Elevated', hex: '#ecf5ef', note: '--ui-bg-elevated' },
  { name: 'Border', hex: '#e3efe8', note: '--ui-border' },
  { name: 'Ink', hex: '#10201a', note: '--ui-text-highlighted' },
  { name: 'Muted text', hex: '#5a6b62', note: '--ui-text-muted' },
  { name: 'Dimmed', hex: '#93a79b', note: '--ui-text-dimmed' },
]

const status = [
  { name: 'Success', color: 'success' as const, hex: '#00a155' },
  { name: 'Warning', color: 'warning' as const, hex: '#d9922b' },
  { name: 'Error', color: 'error' as const, hex: '#e5484d' },
]

const buttonVariants = ['solid', 'soft', 'outline', 'ghost'] as const
const buttonColors = ['primary', 'secondary', 'neutral'] as const

const typeScale = [
  {
    role: 'Ring figure',
    token: 'text-ring-figure',
    extra: 'tabular-nums text-highlighted',
    sample: '1702',
  },
  {
    role: 'h1',
    token: 'text-h1',
    extra: 'text-default',
    sample: 'Today',
  },
  {
    role: 'Stat',
    token: 'text-stat',
    extra: 'tabular-nums text-default',
    sample: '82.4 kg',
  },
  {
    role: 'h2',
    token: 'text-h2',
    extra: 'text-highlighted',
    sample: 'Card heading',
  },
  {
    role: 'Body',
    token: 'text-body',
    extra: 'text-default',
    sample:
      'Body copy on the system stack — fast, neutral, and comfortable to read.',
  },
  {
    role: 'Label',
    token: 'text-label',
    extra: 'text-muted',
    sample: 'Planned finish',
  },
  {
    role: 'Eyebrow',
    token: 'text-eyebrow',
    extra: 'text-muted',
    sample: 'Logged today',
  },
]

function useTypeCaptions() {
  const specimens = useTemplateRef<HTMLElement>('specimens')
  const captions = ref<Record<string, string>>({})
  onMounted(() => {
    const samples =
      specimens.value?.querySelectorAll<HTMLElement>('[data-token]')
    captions.value = Object.fromEntries(
      [...(samples ?? [])].map((el) => [
        el.dataset.token,
        typeCaption(getComputedStyle(el)),
      ]),
    )
  })
  return captions
}

const captions = useTypeCaptions()

const foodOptions = ['Rolled oats', 'Free-range eggs', 'Kangaroo burger']
const selectedFood = ref(foodOptions[0])
const grams = ref(80)
</script>

<template>
  <section class="flex flex-col gap-10">
    <header class="flex flex-col gap-1">
      <p class="text-eyebrow text-muted">Design system</p>
      <h1 class="text-h1 text-default">Vital</h1>
      <p class="text-muted">
        Tucker's visual identity — the day as a ring you close. Green brand,
        coral for protein, warm neutrals, rounded and calm. Source of truth:
        <code class="text-default">frontend/DESIGN.md</code>.
      </p>
    </header>

    <!-- Review the whole guide in either mode — this is the real Appearance
         control from /profile, so it doubles as its own showcase. -->
    <div class="flex flex-wrap items-center gap-3">
      <span class="text-label text-muted">Mode</span>
      <AppearanceControl />
    </div>

    <!-- ── Colour ─────────────────────────────────────────────── -->
    <div class="flex flex-col gap-4">
      <h2 class="text-h2 text-highlighted">Colour</h2>

      <div class="flex flex-col gap-2">
        <p class="text-label text-muted">Primary · brand green</p>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="c in greenScale"
            :key="c.step"
            class="flex flex-col items-center gap-1"
          >
            <span
              class="size-10 rounded-lg ring-1 ring-default"
              :style="{ backgroundColor: c.hex }"
            />
            <span class="text-[10px] tabular-nums text-dimmed">{{
              c.step
            }}</span>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <p class="text-label text-muted">Secondary · coral (protein)</p>
        <div class="flex flex-wrap gap-1.5">
          <div
            v-for="c in coralScale"
            :key="c.step"
            class="flex flex-col items-center gap-1"
          >
            <span
              class="size-10 rounded-lg ring-1 ring-default"
              :style="{ backgroundColor: c.hex }"
            />
            <span class="text-[10px] tabular-nums text-dimmed">{{
              c.step
            }}</span>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <p class="text-label text-muted">Neutrals · green-biased</p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div
            v-for="s in surfaces"
            :key="s.name"
            class="flex items-center gap-2 rounded-xl border border-default bg-elevated/40 p-2"
          >
            <span
              class="size-8 shrink-0 rounded-lg ring-1 ring-default"
              :style="{ backgroundColor: s.hex }"
            />
            <div class="min-w-0">
              <p class="truncate text-xs font-medium text-default">
                {{ s.name }}
              </p>
              <p class="truncate text-[10px] text-dimmed">{{ s.note }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-2">
        <p class="text-label text-muted">
          Status · a separate axis, never the accent
        </p>
        <div class="flex flex-wrap gap-2">
          <UBadge
            v-for="s in status"
            :key="s.name"
            :color="s.color"
            variant="subtle"
          >
            {{ s.name }} · {{ s.hex }}
          </UBadge>
        </div>
      </div>
    </div>

    <!-- ── Typography ─────────────────────────────────────────── -->
    <div class="flex flex-col gap-4">
      <h2 class="text-h2 text-highlighted">Typography</h2>
      <!-- Each caption is read off its rendered sample, so it states what the
           token actually compiles to rather than what it was meant to. -->
      <dl
        ref="specimens"
        class="flex flex-col gap-4 rounded-2xl border border-default bg-default p-5"
      >
        <div v-for="t in typeScale" :key="t.token" class="flex flex-col gap-1">
          <dt :data-token="t.token" :class="[t.token, t.extra]">
            {{ t.sample }}
          </dt>
          <dd class="text-xs text-dimmed tabular-nums">
            {{ `${t.role} · ` }}<code>{{ t.token }}</code>
            <template v-if="captions[t.token]">
              · {{ captions[t.token] }}</template
            >
          </dd>
        </div>
      </dl>
    </div>

    <!-- ── Shape & elevation ──────────────────────────────────── -->
    <div class="flex flex-col gap-4">
      <h2 class="text-h2 text-highlighted">Shape &amp; elevation</h2>
      <div class="flex flex-wrap items-end gap-4">
        <div class="flex flex-col items-center gap-2">
          <span
            class="size-20 rounded-[1.25rem] border border-default bg-default shadow-card"
          />
          <span class="text-xs text-dimmed">Card · 20px · shadow-card</span>
        </div>
        <div class="flex flex-col items-center gap-2">
          <span class="size-20 rounded-xl border border-default bg-default" />
          <span class="text-xs text-dimmed">Chip · 12px</span>
        </div>
        <div class="flex flex-col items-center gap-2">
          <span class="h-12 w-20 rounded-full bg-primary shadow-float" />
          <span class="text-xs text-dimmed">Pill · shadow-float</span>
        </div>
      </div>
    </div>

    <!-- ── Signature: the Ring (the real component) ─────────────── -->
    <div class="flex flex-col gap-4">
      <h2 class="text-h2 text-highlighted">Signature · the Ring</h2>
      <p class="-mt-2 text-sm text-muted">
        The live <code class="text-default">DayRing</code> component — under
        budget, then over (the calorie arc + centre turn to error red).
      </p>
      <div
        class="rounded-[1.25rem] border border-default bg-default p-6 shadow-card"
      >
        <DayRing
          :calories-consumed="1004"
          :calorie-budget="2140"
          :calories-remaining="1136"
          :protein-consumed="86"
          :protein-floor="186"
        />
      </div>
      <div
        class="rounded-[1.25rem] border border-default bg-default p-6 shadow-card"
      >
        <DayRing
          :calories-consumed="2500"
          :calorie-budget="2140"
          :calories-remaining="-360"
          :protein-consumed="205"
          :protein-floor="186"
        />
      </div>
    </div>

    <!-- ── Buttons ────────────────────────────────────────────── -->
    <div class="flex flex-col gap-4">
      <h2 class="text-h2 text-highlighted">Buttons</h2>
      <div class="flex flex-col gap-3">
        <div
          v-for="color in buttonColors"
          :key="color"
          class="flex flex-wrap items-center gap-2"
        >
          <UButton
            v-for="variant in buttonVariants"
            :key="variant"
            :color="color"
            :variant="variant"
          >
            {{ color }} {{ variant }}
          </UButton>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton icon="i-lucide-plus" color="primary">Log entry</UButton>
          <UButton
            icon="i-lucide-plus"
            color="primary"
            square
            aria-label="Add"
          />
          <UButton color="secondary">Protein</UButton>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            square
            aria-label="Delete"
          />
        </div>
      </div>
    </div>

    <!-- ── Cards & entries ────────────────────────────────────── -->
    <div class="flex flex-col gap-4">
      <h2 class="text-h2 text-highlighted">Cards &amp; entries</h2>
      <UCard>
        <p class="text-eyebrow text-muted">Logged today</p>
        <!-- The Figure row: the name is what the eye lands on, and what the
             entry cost sits under it in quieter type, led by the grams a weighed
             entry was logged at. The unit is spelled out,
             so the pair gets the row's whole width and the far end carries only
             the action. The middle row shows an Estimated entry logged without a
             protein figure — the clause is omitted, never rendered as
             `0 g protein` — and wears the flag inline after its name. -->
        <ul class="mt-2 divide-y divide-default">
          <li class="flex items-center justify-between gap-2 py-2.5">
            <FigureRow
              class="flex-1"
              name="Rolled oats"
              figures="80 g · 302 kcal · 11 g protein"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              square
              class="size-9 shrink-0 text-muted"
              aria-label="Delete Rolled oats — 80 g · 302 kcal · 11 g protein"
            />
          </li>
          <li class="flex items-center justify-between gap-2 py-2.5">
            <FigureRow class="flex-1" name="Flat white" figures="90 kcal">
              <template #marker>
                <EstimateBadge />
              </template>
            </FigureRow>
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              square
              class="size-9 shrink-0 text-muted"
              aria-label="Delete Flat white — 90 kcal"
            />
          </li>
          <li class="flex items-center justify-between gap-2 py-2.5">
            <FigureRow
              class="flex-1"
              name="Kangaroo burger"
              figures="150 g · 219 kcal · 33 g protein"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="neutral"
              variant="ghost"
              square
              class="size-9 shrink-0 text-muted"
              aria-label="Delete Kangaroo burger — 150 g · 219 kcal · 33 g protein"
            />
          </li>
        </ul>
      </UCard>
    </div>

    <!-- ── Form controls ──────────────────────────────────────── -->
    <div class="flex flex-col gap-4">
      <h2 class="text-h2 text-highlighted">Form controls</h2>
      <UCard>
        <div class="flex flex-col gap-4">
          <UFormField label="Food">
            <USelectMenu
              v-model="selectedFood"
              :items="foodOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Grams">
            <UInput
              v-model="grams"
              type="number"
              trailing-icon="i-lucide-scale"
              class="w-full"
            />
          </UFormField>
          <UButton block color="primary">Log weighed entry</UButton>
        </div>
      </UCard>
    </div>
  </section>
</template>
