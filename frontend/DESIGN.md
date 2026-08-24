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

Tucker tracks two things, and each is a **ring you close**: the **day** — the
calorie ring with its protein arc — and the **goal** — one green arc closing on
a target weight. Everything around them stays quiet, rounded, and calm.
Warm-leaning greens keep it healthy without shouting; a single coral accent
gives protein its own identity and keeps the page from being monochrome-green.

The two rings are **peers, drawn at the same geometry**. Sizing one down would
rank weight against calories, and Tucker doesn't — they are the two things it
measures. They stay apart by arc count, not by size: the day is a double arc,
the goal a single one.

> **Spend boldness only on a ring.** One loud thing per thing tracked, and no
> more. Cards, nav, and type stay deliberately restrained so both rings land — a
> third would make it a pattern instead of a signature.

The rule scales down, never up. With **Calorie Tracking** off there is no day to
close, so the Goal ring is the only ring on the page and that User is back to
exactly one loud thing.

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
`--ui-*` surface/text/border tokens in `main.css`. The table below is the light
set; the dark set (same rule, inverted) lives in [Dark mode](#dark-mode).

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

## Dark mode

The user picks **Light / Dark / System** from an **Appearance** control on
`/profile`; a fresh device with no stored choice defaults to **System** (follows
the OS via `prefers-color-scheme`). The preference is a **local device** setting
— persisted in the `@nuxtjs/color-mode` cookie, not on the backend `Profile`.
Theme is pure presentation the server never acts on (unlike the reminder prefs,
which it does), so it stays client-side for now; syncing it per-user once Tucker
is multi-user is a deliberate later step, not a fork of this work. No ADR — the
choice is reversible (moving to `Profile` later is purely additive) and dark mode
isn't diet-domain language, so it's recorded here rather than in `CONTEXT.md` or
`docs/adr/`.

**Palette rule — extension, not fork.** The 11-step `green-*` and `coral-*` ramps
are brand constants (pinned to the PWA icons + `manifest.theme_color`) and are
**identical in both modes**. Only the neutral `--ui-*` surface/text/border tokens
and the `.app-canvas` wash get dark values. A dark surface may _reference a
lighter step of the same ramp_ (e.g. `green-400` rather than `green-500`) where
`green-500` on a dark ground fails contrast — that's re-selecting a step, not
re-hueing the ramp. The dark neutrals (palette **"Forest"**) are WCAG-AA verified
on the dark canvas (body 12.9:1, highlighted 15:1, muted 6.4:1 on `--ui-bg`); the
full set lives in the `.dark` block in `main.css`.

| Token             | Light     | Dark ("Forest")                              |
| ----------------- | --------- | -------------------------------------------- |
| `.app-canvas`     | `#eff6f1` | `#0f1a15` (green-tinted near-black, darkest) |
| `--ui-bg`         | `#ffffff` | `#16241d` (a step up so cards lift)          |
| `--ui-text`       | `#24352c` | `#dce9e2` (green-biased light ink)           |
| `--ui-text-muted` | `#5a6b62` | `#93a89d`                                    |
| `--ui-border`     | `#e3efe8` | `#26362e` (low-contrast dark green-grey)     |

The **status** inks lift one step for legibility on dark, and `--ui-error` is a
_saturated rose_ (`#ff5a76`, not a washed pink) specifically so the over-budget
calorie arc separates from the orange protein coral on the Day Ring — two warm
reds that otherwise muddy together. Card **elevation** in dark comes from the
surface step + hairline border + a dark ambient shadow (the light green lift-glow
vanishes on a dark ground); the FAB keeps its brand-green halo.

**PWA chrome.** `manifest.theme_color` / `background_color` stay branded-green —
the launch splash is static and on-brand. The browser/status-bar colour tracks
the active mode via a **single reactive** `<meta name="theme-color">` set in
`app.vue` from `useColorMode().value` — which resolves `System` to the real OS
scheme (and updates when the OS flips) and reflects a _pinned_ mode (Dark on a
light-OS device) too. A static `prefers-color-scheme` media pair is deliberately
avoided: it shares the `theme-color` name, so Unhead dedupes it against the
reactive meta and the reactive value clobbers the media variants.

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

| Token                | Value                           | Applies to                                             |
| -------------------- | ------------------------------- | ------------------------------------------------------ |
| `--ui-radius` (base) | `0.5rem` (8px)                  | Nuxt UI derives inputs/badges/menus from this          |
| Input radius         | `rounded-md` = 1.5x base (12px) | `UInput`, `USelect`, popover content, `DateField`      |
| Card radius          | 20px (`rounded-[1.25rem]`)      | `UCard`, tiles, the ring card                          |
| Chip / mark radius   | 12px                            | entry marks, icon chips                                |
| Button radius        | `9999px` (pill)                 | all buttons except the form-control trigger, + the FAB |

| Elevation | Shadow                                                                 | Use                                                           |
| --------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| Card      | `0 8px 22px -12px rgba(0,193,106,.28), 0 2px 6px -3px rgba(0,0,0,.06)` | resting cards — a soft **green-tinted** lift, not a grey drop |
| Floating  | `0 10px 24px -6px rgba(0,193,106,.45)`                                 | the phone FAB                                                 |

Spacing rhythm: `gap-4` (16px) between stacked cards; card padding `p-5` (20px)
on desktop, `p-4` on phone.

---

## Signature — the Day Ring

The first of the two rings, on Today while the User is counting calories and a
Calorie Budget exists. Replaces the twin progress-bar block it grew out of.

- **Two concentric arcs.** Outer = **calories** (primary green), inner =
  **protein** (coral). Each arc's sweep = `consumed / target`, **capped at 100%**
  so an over-target day reads as a full ring, never an overshoot.
- **Centre** = calories remaining as the big Nunito-800 figure + a quiet
  `kcal left` label. Over budget → the figure and the calorie arc switch to
  **error red** and the label reads `kcal over`.
- **Legend** beside (desktop) / below (phone): two rows — Calories `1,004 / 2,140`
  and Protein `86 / 186 g` — each with its keyed colour swatch and a slim
  rounded meter echoing the arc.
- **Geometry:** 160px viz, 15px stroke, `stroke-linecap: round`, outer r 72 /
  inner r 52 in a 176 viewBox, rotated −90° so both start at 12 o'clock. Owned by
  `RingGauge.vue`, which both rings draw through.
- **Accessibility:** the ring is decorative SVG (`aria-hidden`); the legend rows
  are the accessible text equivalent (real numbers, labelled). Never colour-alone
  — every arc has its number beside it. Honour `prefers-reduced-motion` (no
  sweep animation when set).

---

## Signature — the Goal Ring

The second ring, on Today wherever there is an active **Goal** still to close.
Same geometry as the Day Ring, one arc instead of two.

- **One arc**, primary green, sweeping `percentComplete / 100` — capped like the
  Day Ring's, so a goal past its target reads as a closed ring.
- **Centre** = kilograms still to go as the big Nunito-800 figure + a quiet
  `kg to go` label. No red state: being short of a goal is not a fault, and red
  on the Day Ring means something that has happened.
- **Legend** beside (desktop) / below (phone): the swatch and an `h2` reading
  **Goal progress**, the **pace badge** beside it, `NN% complete` under it, and
  the **Trend Weight** and **Target** below a rule — the denominator the
  percentage is a share of. The pace badge is **omitted** while the backend
  withholds `paceStatus`; an empty badge would claim a verdict there isn't one.
- **Geometry:** identical to the Day Ring, deliberately (see Thesis).
- **Whole card is a link** to `/review`, carrying its own `aria-label` so the
  link announces as one rather than as every figure on the card read aloud.
- **No ring in Maintenance Mode.** Maintenance Mode _is_ the absence of a Goal
  (ADR 0008), so there is nothing to close; the Maintaining card stays the shape
  for it.
- **No ring on a reached Goal either.** A reached Goal stays active until the User
  resolves the fork (ADR 0008), and `ReachedGoalBanner` carries that moment; a
  100% ring beside it would say the same thing twice.

---

## The Check pair — peer rings, not the Day Ring

A **Check** (ADR 0022) borrows the Ring's colour keying and geometry but **not**
its nested form, and the reason is honesty rather than variety.

- **Two rings at equal radius, side by side** — outer-sized arcs on a shared
  geometry, calories (green) left, protein (coral) right. The Day Ring's
  concentric arcs have different circumferences, so equal percentages draw as
  unequal lengths. That costs the Day Ring nothing, because it tracks two
  independent journeys. A Check _compares_ cost against return, so unequal
  lengths for equal shares would be a lie told by the geometry. Peer rings also
  stop the screen being misread as today's progress.
- **Cost never turns red.** Red on the Day Ring means _over budget_ — a thing
  that has happened. On a Check nothing has been eaten, so a product costing 90%
  of the Budget stays green. Tucker never labels a Food (CONTEXT.md), and colour
  is the easiest place to break that rule by accident.
- **Centres** carry the share as a percentage; the absolute pair (`533 / 2492
kcal`) sits beneath its own ring, so no arc is ever colour-alone. Calorie
  figures are ungrouped, as on the Day Ring; the whole-day allowance goes through
  `formatGrams`, which groups, because it reaches four digits. Past a full circle
  the centre and the arc part company on purpose — the arc caps at 100% (an
  over-target reading is a full ring, never an overshoot) while the percentage
  keeps counting, because a 250 g portion of something dense can cost half the
  day again over and rounding that to "100%" would understate it.
- **Portion dial** — a full-width slider directly under the rings, 10–250 g in
  5 g steps, opening at 100 g. Its live readout sits on the same line as the
  `Portion` label, right-aligned above the track, so a thumb at the bottom of a
  phone never has to look to the top of the screen to read what it just set. The
  track deliberately stops well short of the day's allowance: running it to four
  digits would bury the 10–100 g zone where real portions live. Everything above
  the dial moves with it and everything below it holds still — that contrast _is_
  the screen's argument (ADR 0022), so nothing that scales may be placed among
  the pace lines. Nuxt UI hardcodes the thumb's accessible name to "Thumb", so
  the `role="group"` wrapper is labelled by the readout instead.
- **Macro bar** — one rounded track split three ways by each macro's share of the
  item's own calories. Protein takes coral; **carbs and fat take neutrals**,
  because protein is the only macro Tucker sets a target for and the palette
  should say so. Grams are labelled beneath (at the dialled portion, like every
  other gram figure on the screen), never colour alone; the segment **widths** are
  shares of the item's own calories, so the portion never redraws them.
- **Viewfinder** — a Check's landing state is the camera itself: a black,
  20px-radius surface with the instruction over it, capped at `max-w-md` so it
  fills a phone but doesn't become a slab on desktop. A denied camera ends the
  screen (ADR 0022) — it offers no manual path, unlike the Add-Food scanner.
- **Failure is the whole experience here**, because there is nothing else to
  offer, so the three outcomes get three headings and three icons rather than one
  shared apology: nothing came back (`i-lucide-search-x`), the product's
  nutrition is incomplete and rescanning is futile (`i-lucide-file-question`),
  and the lookup itself failed (`i-lucide-cloud-off`). **Scan another** is the
  action all three share, because moving on is always available. Only the third
  also gets **Try again** — it lives inside that alert's own `actions`, so it
  structurally cannot render for the two permanent outcomes, where re-asking is
  bad advice (ADR 0007). It re-runs the lookup against the barcode already
  decoded; the camera is not restarted, since the scan was never what failed.
  Attribution for Provider-sourced figures (`Data from …`) sits under the macro
  bar (ADR 0006).

---

## Component treatments

- **Card** — white surface, 1px `border-default`, 20px radius, green-tinted card
  shadow, `p-5`/`p-4`. The default container for every Today block.
- **Button** — pill. Primary = solid green; secondary = coral; low-emphasis =
  ghost/neutral. Icon buttons are circular.
- **Form-control trigger** — a control that opens an overlay (today only
  `DateField`, which opens a calendar) is a button by markup but a _field_ by
  role, so it wears the input treatment, not the pill: `rounded-md` and the
  `md` input padding, full width, value left / affordance icon right, and
  **dimmed** until it holds a value — `text-dimmed` is the placeholder token the
  input theme itself uses, not the `text-muted` of a label. It sits beside real inputs in a form and a pill
  there reads as an action. The classes are Nuxt UI's own input theme copied
  onto `UButton` — the one place the app-wide pill in `app.config.ts` is
  overridden per-component rather than in the theme.
- **FAB** (phone) — solid green pill-circle, floating shadow, bottom-right above
  the tab bar (respects `env(safe-area-inset-bottom)`).
- **Nav** — side rail on desktop (`lg:`), bottom tab bar on phone. Active item =
  primary text on a `primary/10` tint (rail) / primary text (tabs).
- **Chip / badge** — pill, subtle tint of its colour (`primary/10`, `coral/10`,
  `warning/15`). The estimate flag is icon **+** text in warning, never colour
  alone.
- **Progress / meter** — fully rounded track on `--ui-bg-muted`, fill in the
  series colour. Kept where it echoes an arc a reader cannot compare by eye — the
  Day Ring's two nested arcs — and for the goal hero on `/review`, which has no
  ring. The Goal ring has one arc and no meter: a second drawing of the same
  number is what a ring replaces.
- **Identity byline** — "Signed in as `<email>`" plus a **Sign out** link, muted
  and 14px, on the line directly under the `/profile` h1. A byline rather than a
  card, and this is the whole visible surface of multi-user: it attributes the
  page instead of adding a seventh section to one that already carries six. It
  answers "whose diet am I looking at?" before any number is read, which is why
  it leads rather than sitting in the footer with the install prompt and build
  tag. A long address wraps on a phone and is never truncated — half an address
  is a worse answer than none — and the mechanism is `wrap-anywhere` on the
  address itself, **not** the container's `flex-wrap`, which only lets the link
  drop to a second row. `break-words` is the trap: CSS leaves it out of a flex
  item's min-content floor, so it reads as the fix and still overflows. It
  appears on **no other page**;
  identity is chrome, and repeating it would make multi-user louder than it is.
  **The one place a read failure gets no load-error state.** If `/api/me` fails the
  name is dropped and **Sign out stays**, because the link is static and needs no
  backend — the half that still works survives, exactly when you may most want out.
  A "Couldn't load your identity / Retry" row would also be disproportionate for
  chrome, and a session that has genuinely ended is already caught one level up by
  the shell-level signed-out interstitial. The failure is logged, not swallowed:
  otherwise the only symptom is a missing name, which reads as a design choice.

---

## Feedback states — empty / load-error / signed-out

Three states share one shape (icon + heading + body + optional button, centred,
`flex flex-col items-center gap-3 py-12 text-center`) but read differently
through icon and colour, never through colour alone.

| State      | Icon                                 | Icon colour  | Heading pattern                          | Body                                   | Action                                    |
| ---------- | ------------------------------------ | ------------ | ---------------------------------------- | -------------------------------------- | ----------------------------------------- |
| Empty      | subject icon (e.g. `i-lucide-salad`) | `text-muted` | "Build your…" — invites the first action | says what to do next                   | primary CTA (e.g. "Add your first food")  |
| Load error | `i-lucide-cloud-off`                 | `text-error` | "Couldn't load your `<thing>`"           | "Check your connection and try again." | "Retry" — replays the same fetch          |
| Signed out | `i-lucide-lock`                      | `text-error` | "You've been signed out"                 | "Sign back in to keep tracking."       | "Sign back in" — forces a real navigation |

- **Empty** means "nothing here yet, and that's expected" — quiet, muted icon,
  inviting tone. **Load error** and **signed out** both use the Status **error**
  red (`#E5484D`, see Colour) on the icon only; the surrounding card stays the
  same restrained white/quiet treatment as everywhere else. Colour is always
  paired with a distinct icon and heading per state — never the only signal.
- **Load error and signed out are deliberately different icons and verbs**
  (`cloud-off` / "Retry" vs. `lock` / "Sign back in"), because they call for
  different user actions — telling someone to "check your connection" when
  they're actually signed out is wrong advice.
- **One vocabulary for the session boundary: _sign in / sign out_.** The app says
  "Signed in as…", "Sign out", "You've been signed out", "Sign back in" — never
  "log in". An action keeps its name across the whole flow, and the boundary is
  crossed in both directions, so the two directions have to be the same word.
  (Cloudflare's own `/cdn-cgi/access/logout` path is theirs, not copy.)
- **Placement:** a load-error state replaces the specific region that failed to
  load — the full page body for a page's primary data (Today's summary, the
  Foods catalog, a Review), or just the one card for a secondary widget (e.g.
  Today's weight or goal-progress card). It never sits beside a misleading
  empty state.
- **Signed out is a single, page-level interstitial** — rendered once at the
  shell, not duplicated per-widget. If the session is gone, every fetch fails
  identically; one clear message beats six identical "Retry" cards that would
  all fail the same way.
- **Signing out deliberately isn't a feedback state at all.** It is the Identity
  byline on `/profile` (see Component treatments), in muted neutral — never the
  error red, which on this palette means _over budget, destructive, failed_.
  Being signed out unexpectedly is a fault; choosing to leave is not, and
  colouring them alike would say it is.
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
   - `.dark` — an equally-unlayered block **after** `:root` (so it wins the
     specificity tie) that redefines the same `--ui-*` neutrals + `.app-canvas`
     for dark; the brand ramps are untouched. `@nuxtjs/color-mode` (ships with
     `@nuxt/ui`) toggles the `.dark` class on `<html>` from `useColorMode()`.
   - `--font-sans` display wiring + `@nuxt/fonts` `Nunito` declaration; keep a
     system fallback so an offline first-paint never blanks.
3. **PWA** (`nuxt.config.ts` + `app.vue`) — `manifest.theme_color` stays
   `#00c16a`; `background_color` → the canvas wash `#eff6f1` (matches
   `.app-canvas`). A **single reactive** `<meta name="theme-color">` in `app.vue`,
   fed by `useColorMode().value`, tracks the active mode so the installed app's
   status bar matches dark (a static media pair is avoided — see Dark mode). The
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
- **Dark mode is an extension, not a fork** (see [Dark mode](#dark-mode)): the
  `green-*`/`coral-*` brand ramps are identical across modes; only the neutral
  `--ui-*` tokens + `.app-canvas` flip. Theme is a local (cookie) preference,
  not backend state.
