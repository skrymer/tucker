# Tucker Design System — "Vital"

The recorded visual identity for the Tucker frontend. Every colour, type, and
shape decision in the app derives from the tokens here; the executable form is
`app/app.config.ts` (Nuxt UI colour roles) + `app/assets/css/main.css` (the
`--ui-*` token overrides, the custom `coral` palette, and the self-hosted
display face). When the two disagree, **this document is the intent and the code
is the bug** — fix the code, or update this doc in the same change and say why.

Chosen from a throwaway A/B/C prototype exercise (Scale / Ledger / **Ring**).
Ring won: Tucker is goal-driven and health-forward, so the day's fuel reads best
as a ring you're closing.

---

## Thesis

The day is a **ring you close**. One bold signature — the calorie ring with a
protein arc — carries the personality; everything around it stays quiet,
rounded, and calm. Warm-leaning greens keep it healthy without shouting; a
single coral accent gives protein its own identity and keeps the page from being
monochrome-green.

> **Spend boldness in one place.** The ring is the one loud thing. Cards, nav,
> and type are deliberately restrained so it lands.

---

## Colour

Semantic roles are separate from the brand accent. Green is the brand/primary;
coral is a **secondary accent** that means _protein_, not a status. Status colour
(success / warning / error) is its own axis and never borrows the accent.

### Primary — Tucker green (brand `#00c16a`)

Anchored on the existing brand mark (PWA icons + `manifest.theme_color`), so the
new skin stays continuous. The scale is pinned in `main.css` `@theme` (not left
to Nuxt UI's built-in `green`) so `--ui-primary` resolves to exactly `#00c16a`.

| Step | Hex       | Step | Hex           |
| ---- | --------- | ---- | ------------- |
| 50   | `#EFFDF5` | 500  | **`#00C16A`** |
| 100  | `#D9FBE8` | 600  | `#00A155`     |
| 200  | `#B3F5D1` | 700  | `#007F45`     |
| 300  | `#75EDAE` | 800  | `#016538`     |
| 400  | `#00DC82` | 900  | `#0A5331`     |
|      |           | 950  | `#052E16`     |

### Secondary — Coral (protein)

New to the identity. A red-orange that reads as warmth/energy against the green.
Used for the **protein arc**, protein stats, and the occasional secondary CTA —
never for status. Defined as a custom `coral` palette in `main.css` `@theme`.

| Step | Hex       | Step | Hex           |
| ---- | --------- | ---- | ------------- |
| 50   | `#FFF1ED` | 500  | **`#FF6B4A`** |
| 100  | `#FFE0D6` | 600  | `#ED4E2C`     |
| 200  | `#FFC3B0` | 700  | `#C63C20`     |
| 300  | `#FF9E82` | 800  | `#9E3220`     |
| 400  | `#FF8460` | 900  | `#7F2C1E`     |
|      |           | 950  | `#451208`     |

`500` fills the arc; `600` is the text-on-light shade (meets contrast on white).

### Neutrals — green-biased (not slate)

Neutrals carry a faint green hue so they read as _chosen_, not inherited. Set via
`--ui-*` surface/text/border tokens in `main.css` (light mode only — Tucker is
light-only for now).

| Token          | Hex       | Role                                                     |
| -------------- | --------- | -------------------------------------------------------- |
| Canvas wash    | `#eff6f1` | app background (`.app-canvas`, = PWA `background_color`) |
| Card surface   | `#ffffff` | cards + default surfaces (`--ui-bg`)                     |
| Muted surface  | `#f1f8f3` | insets, progress track base (`--ui-bg-muted`)            |
| Elevated       | `#ecf5ef` | hover, neutral-soft (`--ui-bg-elevated`)                 |
| Border default | `#e3efe8` | card + divider lines (`--ui-border`)                     |
| Border muted   | `#edf4ef` | faintest rules (`--ui-border-muted`)                     |
| Ink            | `#10201a` | primary text (`--ui-text-highlighted`)                   |
| Text           | `#24352c` | body text (`--ui-text`)                                  |
| Muted text     | `#5a6b62` | labels, secondary (`--ui-text-muted`)                    |
| Dimmed text    | `#93a79b` | captions, disabled (`--ui-text-dimmed`)                  |

White cards sit on the pale-green canvas wash and lift with the card shadow;
`--ui-bg` is white so every default Nuxt UI surface reads as a card.

### Status (semantic, separate axis)

| Role    | Hex                   | Use                                    |
| ------- | --------------------- | -------------------------------------- |
| Success | `#00A155` (green-600) | on-target day                          |
| Warning | `#D9922B` (amber)     | estimate flag                          |
| Error   | `#E5484D`             | **over budget**, destructive, failures |

Over-budget is the one place the calorie ring leaves green: the arc and centre
figure switch to **error**, not coral.

---

## Typography

One warm rounded face for display, the system stack for body. Boldness stays in
the ring, so type is friendly-but-quiet.

| Role    | Family                                                   | Weights  | Notes                                                                                                                                             |
| ------- | -------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Display | **Nunito** (self-hosted via `@nuxt/fonts`)               | 700, 800 | headings, the ring's centre number, big stat figures. Rounded terminals = the "vital" warmth. Bundled locally — no CDN, works offline in the PWA. |
| Body    | system sans (`-apple-system, "Segoe UI", Roboto, …`)     | 400–600  | running text, entry rows, labels. Fast, neutral, no shipped weight.                                                                               |
| Numeric | inherits (Nunito for display figures, system for inline) | —        | always `font-variant-numeric: tabular-nums` where digits align in columns or update live.                                                         |

### Scale

| Token        | Size / line                  | Weight  | Use                                |
| ------------ | ---------------------------- | ------- | ---------------------------------- |
| Ring figure  | 40px / 1                     | 800     | kcal remaining, centre of the ring |
| Display / h1 | 30px / 1.05                  | 800     | page title ("Today")               |
| Stat         | 22px / 1.1                   | 800     | ring-legend values, tile figures   |
| h2           | 18px / 1.3                   | 700     | card headings                      |
| Body         | 15px / 1.5                   | 400–500 | default                            |
| Label        | 13px                         | 600     | meta, secondary lines              |
| Eyebrow      | 11.5px, `+0.06em`, uppercase | 650     | section kickers ("Logged today")   |

Headings get `text-wrap: balance`; body copy stays near a 65-character measure.

---

## Shape & elevation

Rounded and soft — the friendly pole. Radius is generous; buttons are pills.

| Token                | Value                      | Applies to                              |
| -------------------- | -------------------------- | --------------------------------------- |
| `--ui-radius` (base) | `0.5rem` (8px)             | Nuxt UI derives inputs/badges from this |
| Card radius          | 20px (`rounded-[1.25rem]`) | `UCard`, tiles, the ring card           |
| Chip / mark radius   | 12px                       | entry marks, icon chips                 |
| Button radius        | `9999px` (pill)            | all buttons + the FAB                   |

| Elevation | Shadow                                                                 | Use                                                           |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| Card      | `0 8px 22px -12px rgba(0,193,106,.28), 0 2px 6px -3px rgba(0,0,0,.06)` | resting cards — a soft **green-tinted** lift, not a grey drop |
| Floating  | `0 10px 24px -6px rgba(0,193,106,.45)`                                 | the phone FAB                                                 |

Spacing rhythm: `gap-4` (16px) between stacked cards; card padding `p-5` (20px)
on desktop, `p-4` on phone.

---

## Signature — the Ring

The one memorable element. Replaces the twin progress-bar block on Today when a
budget exists.

- **Two concentric arcs.** Outer = **calories** (primary green), inner =
  **protein** (coral). Each arc's sweep = `consumed / target`, **capped at 100%**
  so an over-target day reads as a full ring, never an overshoot.
- **Centre** = calories remaining as the big Nunito-800 figure + a quiet
  `kcal left` label. Over budget → the figure and the calorie arc switch to
  **error red** and the label reads `kcal over`.
- **Legend** beside (desktop) / below (phone): two rows — Calories `1,004 / 2,140`
  and Protein `86 / 186 g` — each with its keyed colour swatch and a slim
  rounded meter echoing the arc.
- **Geometry:** 168px viz, 14px stroke, `stroke-linecap: round`, outer r 72 /
  inner r 52, rotated −90° so both start at 12 o'clock.
- **Accessibility:** the ring is decorative SVG (`aria-hidden`); the legend rows
  are the accessible text equivalent (real numbers, labelled). Never colour-alone
  — every arc has its number beside it. Honour `prefers-reduced-motion` (no
  sweep animation when set).

---

## Component treatments

- **Card** — white surface, 1px `border-default`, 20px radius, green-tinted card
  shadow, `p-5`/`p-4`. The default container for every Today block.
- **Button** — pill. Primary = solid green; secondary = coral; low-emphasis =
  ghost/neutral. Icon buttons are circular.
- **FAB** (phone) — solid green pill-circle, floating shadow, bottom-right above
  the tab bar (respects `env(safe-area-inset-bottom)`).
- **Nav** — side rail on desktop (`lg:`), bottom tab bar on phone. Active item =
  primary text on a `primary/10` tint (rail) / primary text (tabs).
- **Chip / badge** — pill, subtle tint of its colour (`primary/10`, `coral/10`,
  `warning/15`). The estimate flag is icon **+** text in warning, never colour
  alone.
- **Progress / meter** — fully rounded track on `--ui-bg-muted`, fill in the
  series colour. Kept for the goal + protein meters; the calorie/protein headline
  is the ring.

---

## Feedback states — empty / load-error / logged-out

Three states share one shape (icon + heading + body + optional button, centred,
`flex flex-col items-center gap-3 py-12 text-center`) but read differently
through icon and colour, never through colour alone.

| State      | Icon                                 | Icon colour  | Heading pattern                          | Body                                   | Action                                   |
| ---------- | ------------------------------------ | ------------ | ---------------------------------------- | -------------------------------------- | ---------------------------------------- |
| Empty      | subject icon (e.g. `i-lucide-salad`) | `text-muted` | "Build your…" — invites the first action | says what to do next                   | primary CTA (e.g. "Add your first food") |
| Load error | `i-lucide-cloud-off`                 | `text-error` | "Couldn't load your `<thing>`"           | "Check your connection and try again." | "Retry" — replays the same fetch         |
| Logged out | `i-lucide-lock`                      | `text-error` | "You've been logged out"                 | "Log back in to keep tracking."        | "Log back in" — forces a real navigation |

- **Empty** means "nothing here yet, and that's expected" — quiet, muted icon,
  inviting tone. **Load error** and **logged out** both use the Status **error**
  red (`#E5484D`, see Colour) on the icon only; the surrounding card stays the
  same restrained white/quiet treatment as everywhere else. Colour is always
  paired with a distinct icon and heading per state — never the only signal.
- **Load error and logged out are deliberately different icons and verbs**
  (`cloud-off` / "Retry" vs. `lock` / "Log back in"), because they call for
  different user actions — telling someone to "check your connection" when
  they're actually logged out is wrong advice.
- **Placement:** a load-error state replaces the specific region that failed to
  load — the full page body for a page's primary data (Today's summary, the
  Foods catalog, a Review), or just the one card for a secondary widget (e.g.
  Today's weight or goal-progress card). It never sits beside a misleading
  empty state.
- **Logged out is a single, page-level interstitial** — rendered once at the
  shell, not duplicated per-widget. If the session is gone, every fetch fails
  identically; one clear message beats six identical "Retry" cards that would
  all fail the same way.
- **No toast for read failures.** The persistent-retry toast in
  [ADR 0005](../docs/adr/0005-notifications-persistent-errors-quiet-success.md)
  exists because a mutation's sheet closes and focus moves away from the
  failure. A failed read renders its error exactly where focus already is, so a
  toast on top would just repeat what's already on screen — the same "don't
  confirm what's already visible" logic ADR 0005 applies to success, applied
  here to failure. Toasts stay reserved for mutations.
- **Copy reuse:** the load-error body text ("Check your connection and try
  again.") is the exact phrase already used in the mutation-error toast
  (`useApiMutation.ts`), and "Retry" is the same verb — one vocabulary for
  "this action failed, try it again" everywhere in the app.

---

## Mapping to Nuxt UI (implementation)

1. **`app/app.config.ts`** — `ui.colors`: `primary: 'green'`, `secondary:
'coral'`, `neutral: 'neutral'`; plus the pill button (`rounded-full`) and card
   (`rounded-[1.25rem] shadow-card`) slot overrides.
2. **`app/assets/css/main.css`**
   - `@theme` — declare the custom `--color-coral-*` scale (Tailwind/Nuxt UI
     reads it as the `coral` palette).
   - `:root` (light) — override the `--ui-bg*`, `--ui-text*`, `--ui-border*`,
     `--ui-radius`, and the two shadow custom props to the tables above.
   - `--font-sans` display wiring + `@nuxt/fonts` `Nunito` declaration; keep a
     system fallback so an offline first-paint never blanks.
3. **PWA** (`nuxt.config.ts`) — `manifest.theme_color` stays `#00c16a`;
   `background_color` → the canvas wash `#eff6f1` (matches `.app-canvas`). The
   self-hosted font is scoped to `latin`/`normal` and falls under the Workbox
   precache glob so the installed app renders it offline.

## Guardrails

- **Colour is never the only signal** (ADR-aligned, issue #66 sibling): pair it
  with icon + text. The ring proves numbers beside every arc.
- **Business logic stays in the backend** (ADR 0002): the ring renders
  backend-supplied figures (`caloriesConsumed` / `calorieBudget` /
  `caloriesRemaining`, and the protein pair); the day verdict comes from
  `dayStatus`. It never re-derives on-target rules. Arc _fractions_ and the
  rounded over/under split are pure presentation.
- **Light-only** for now; a dark mode is a future extension of this same token
  set, not a fork of it.
