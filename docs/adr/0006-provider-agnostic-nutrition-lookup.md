# Provider-agnostic nutrition lookup for barcode-scanned Foods

Tucker's README has always promised "add a food by scanning its barcode (looked
up in Open Food Facts)", and `CONTEXT.md` assumes scanning autofills a **Food**
from external data (it even specifies a per-100ml→per-100g conversion that only
makes sense if nutrition comes from somewhere). But the only thing built in F3
was the *internal* half: `GET /api/foods/barcode/{barcode}` → `findByBarcode`
against our own `food` table, 404 on a miss. That is nearly useless on its own —
the first time you scan any product you've never logged, you get a miss and gain
nothing over typing it by hand; scanning only pays off on the *second* encounter.

This ADR records the design of the missing piece — the external lookup — and the
decision to make it **provider-agnostic** rather than hard-wired to Open Food
Facts. It was settled in a design interview; the decisions below are the result.

The domain terms it introduces (**Nutrition Provider**, **Food Candidate**) and
the Food-ownership note live in [`CONTEXT.md`](../../CONTEXT.md).

## The lookup is layered, discriminated, and lives in the backend

A barcode scan resolves in three stages, **catalog first, then providers**:

1. **Catalog hit** → an existing, saved **Food** (the user's own, with their
   corrections and density already applied).
2. **Provider hit** → a **Food Candidate**: normalised nutrition that is *not a
   Food yet*. It carries the macros the source supplied (some possibly absent),
   the Provider it came from (+ attribution), that Provider's **stated energy**
   (shown as a cross-check, never stored), and the raw barcode.
3. **Total miss** → nothing; the client opens manual entry with the barcode
   pre-filled.

A **single discriminated endpoint** returns one of `EXISTING | CANDIDATE` (or
**404** for a miss); the frontend branches on the outcome. The catalog-then-chain
resolution order runs **server-side** — this is [0002](0002-business-logic-belongs-in-the-backend.md)
("business logic belongs in the backend") in action: the order of trust is policy,
not something to leak into Vue. The scaffolded `…/barcode/{barcode}` route (which
has no frontend callers) is repurposed to this discriminated shape.

The Candidate is **never persisted by the lookup**. It is returned, the user
reviews and completes it in the existing (now pre-filled) `AddFoodForm`, and the
*existing* `POST /api/foods` is what creates the Food (carrying the `barcode`,
which `CreateFoodRequest` already accepts). No new write path, no half-saved
Foods.

We considered two endpoints (catalog lookup separate from provider lookup) with
the frontend orchestrating. Rejected: it puts the resolution order in the UI,
against 0002.

## Providers are a capability-based backend port, chosen by the operator

A `NutritionProvider` is a backend **port** (interface) with one implementation
per source. The frontend only decodes the barcode and calls our endpoint; it
never talks to a Provider directly. This keeps normalisation, the **Atwater
derivation**, and the per-100ml conversion in the domain (0002), and keeps any
future API keys out of the PWA bundle.

Providers are **capability-based** — each declares what it supports
(`BARCODE_LOOKUP`, `TEXT_SEARCH`, …). The scan chain consults only
barcode-capable Providers; a search-only source (e.g. USDA's generic foods, which
have no barcode) is a legitimate Provider that simply doesn't join a scan, and is
the natural engine for a future text-search autofill on manual entry. We did
**not** make the port barcode-only.

When several Providers are integrated, a lookup tries them as an **ordered
fallback chain, first-match-wins** — near-best coverage at one-tap cost, with the
normalised single-candidate contract leaving room to upgrade to "query-all,
user-disambiguates" later without re-architecting.

**The Provider set and order is the operator's choice, not the user's.** This
followed from a dependency: a Provider's API subscription, credentials, and
rate-limit budget belong to whoever runs Tucker — so *which sources to trust* is
a platform decision, sitting next to the keys in deployment config. There is **no
user-facing provider selection**, no per-user preference. (The interview started
from "the user selects from a list"; recognising the keys as operator secrets
flipped it.)

**Credentials are operator/deployment secrets, not per-user data** — server-side
config, shared across users, never in the bundle. v1 ships **Open Food Facts
only (keyless)**, so v1 needs *zero* credential code. Each Provider's config
carries an *optional* credential field, so a keyed source (USDA's free key next;
a paid API later) is a config addition, not a redesign.

## Calories stay Atwater-derived, even for scanned Foods

Tucker's Food invariant — calories are never entered, always `4·P + 4·C + 9·F`
(the F3 "calories derived from macros" rule) — **holds for scanned Foods too**.
Whatever a Provider returns is normalised to per-100g macros and the calories are
re-derived by Atwater, exactly like a hand-entered Food. The Provider's own
**stated energy is shown only as a cross-check** at confirmation; it is never
stored.

We considered storing the Provider/label energy for scanned Foods (option (b))
and evolving every Food to have a calorie *source* (option (c)). Both rejected:
they fork the invariant (two Foods with identical macros could then differ) for a
~5% label-matching gain, and break the uniform, deterministic core. The
`AddFoodForm`'s required-macro Zod validation is the safety net for the common
case of a Provider returning *partial* macros (e.g. OFF with `fat = null`):
missing fields come back blank and must be filled before save, so Atwater never
silently runs on a hole.

**Accepted consequence:** a scanned Food's calories will *systematically* differ
slightly from the package label (the label counts fibre/polyols/rounding that
flat 4-4-9 does not). We chose model uniformity and determinism over matching the
wrapper; the shown stated-energy cross-check lets the user notice and adjust. This
is the question a future reader is most likely to ask ("why don't scanned foods
match the label?"), and this section is its answer.

## Caching, not a rate limiter

At single-user scale, every free Provider limit (Open Food Facts ~15 product
reads/min per IP; USDA 1,000/hr) is orders of magnitude above a few scans a day —
a throttle would be infrastructure for a problem we don't have. The lever is
**caching**, because a barcode→nutrition result is **user-independent** (the same
product for everyone):

- A **shared, per-barcode result cache** (keyed by barcode, not user). Load then
  scales with *distinct products scanned*, not users or scans. This is a
  deliberate cross-user share of *public* product data — no privacy concern. In
  the multi-user world it converges with the shared scanned-Food catalog (below):
  one user scans a product, it's fetched once, everyone benefits.
- A Provider may be backed by a **local dataset, not just a live API.** Open Food
  Facts explicitly recommends ingesting their JSONL **data dump** past a few
  hundred lookups; doing so turns OFF lookup into a zero-rate-limit, offline-able
  local query. "OFF-via-API" and "OFF-via-dump" are two implementations of one
  port. Future, not v1 — but the seam exists.
- The chain is **429-aware**: per-Provider timeout, circuit-breaker, and
  fall-through to the next Provider on limit/failure. This makes the system
  *correct* under limits even before any throttle exists. An actual token-bucket
  is **deferred** until real multi-user traffic proves cache + dump insufficient
  (they almost always are).

Etiquette that is required regardless of volume: a **descriptive `User-Agent`**
identifying Tucker (OFF IP-bans anonymous/abusive callers) and **ODbL
attribution** for OFF data ("data from Open Food Facts").

## Decode runs entirely client-side, iOS-first

Barcode decoding is **always `zxing-wasm`, one code path** — no native
`BarcodeDetector` fast-path. The reason is decisive: **on iOS every browser is
WebKit/Safari**, which has no `BarcodeDetector`, and the iPhone home-screen PWA is
the *primary* surface (you scan groceries with your phone, not your desktop). A
native-only or progressive-enhancement approach would either exclude the iPhone
or buy a marginal desktop/Android optimisation at the cost of a second code path
to test. `zxing-wasm` runs on every supported engine, with the camera
(`getUserMedia({ facingMode: 'environment' })`) and WASM both working on iOS
Safari. The WASM is **lazy-loaded behind the "Scan" tap**, so it never touches
first paint or the rest of the app. Decoding needs only a **secure context**
(HTTPS / localhost) — already satisfied by the Cloudflare-tunnel deployment — not
any PWA/F6 feature.

The scanner is hosted inside the existing `ResponsiveOverlay` (drawer/modal), not
an all-in-one scanner library that would fight that idiom. **Manual barcode entry
is a permanent peer to the camera**, not just an error fallback — it is the
landing for a Provider miss, a denied/absent camera, *and* the offline case, and
also serves "type the number under the barcode".

**Liquids:** a Provider value published per 100 ml is treated as per 100 g —
density assumed **1 g/ml (water)**, not a per-product density. The error is ≲5%
on the subset of drinks that are non-water, and the Food Candidate confirmation
(with the stated-energy cross-check) is where the user corrects it. A density
table or prompt was rejected as disproportionate.

**Offline (v1):** decode works locally; the lookup is attempted and, on network
failure, degrades to the same barcode-pre-filled manual entry as a miss. Queuing
the lookup was rejected (wrong UX). Caching the user's catalog client-side so
catalog hits resolve offline is flagged for **F6** (it rides on F6's offline
shell) — the one place barcode and F6 genuinely touch.

## Flow and placement

The scanner lives in the **Add-Food flow only** (one mount point): the `/foods`
add affordance gains "Scan barcode" beside manual entry and Recipe, and F2's
"catalog empty / add a new food" path offers it. **No new nav tab.** Per the
glossary, *scanning creates a Food, not an Entry* — so after the Food exists
(confirmed Candidate or catalog hit) the flow **offers "log it now"** as an
explicit next step (a pre-filled Weighed Entry with that Food selected), never an
automatic Entry. A catalog hit leads with "log it", since the Food already
exists.

## Multi-user direction (deferred)

Tucker may become multi-user once the single-user app is proven. The intended
catalog-ownership model — recorded in `CONTEXT.md` and assumed by today's
**global** `idx_food_barcode` uniqueness — is **hybrid**: barcode-scanned product
Foods are **shared/global** (objective, one per barcode, and the same table the
shared per-barcode cache wants), while Recipes, hand-entered Foods, and Estimated
Entries are **private**. Corrections to a shared Food are **copy-on-write** (a
tweak forks a private copy) so one user's fix never rewrites another's logged
history.

For v1 (single user) this changes nothing to build — shared and private collapse
to "the catalog". The only obligation now is to **keep the seam open**: keep the
global barcode index, treat barcode Foods as globally-keyed product data, and add
no assumption that every Food is privately owned (no `owner`/visibility column
yet — YAGNI). This direction is recorded here rather than in its own ADR because
it documents an unbuilt future; it should be **promoted to a standalone ADR when
multi-user work actually starts**.

## Consequences

- **Backend:** a `NutritionProvider` port + an `OpenFoodFactsProvider`
  implementation; a normalisation step (per-100g, density 1.0, Atwater) producing
  a Food Candidate; a shared per-barcode lookup cache; the discriminated
  `…/barcode/{barcode}` endpoint returning `EXISTING | CANDIDATE | 404`; the
  ordered chain with timeout/circuit-breaker/429 fall-through; the Provider chain
  + (future) credentials as deployment config. No new write path — Food creation
  stays `POST /api/foods`.
- **Frontend:** a `zxing-wasm`-backed scanner hosted in `ResponsiveOverlay`,
  lazy-loaded behind the Scan tap; an always-on manual-barcode input; the
  three-outcome branch (surface existing Food → offer log / pre-fill `AddFoodForm`
  from a Candidate / open blank manual entry with the barcode); the "log it now"
  step. Regenerate the typed `nuxt-open-fetch` client after the endpoint change.
- **v1 scope is deliberately narrow:** Open Food Facts only, keyless, online
  lookup with graceful manual fallback, density 1.0, single user. USDA (free
  key) is the first proof of the keyed-config seam; text-search autofill, the OFF
  data-dump backing, a token-bucket throttle, offline catalog cache, and the
  multi-user catalog split are all explicitly **later**.
- This is a substantial feature; it warrants its own **F-number** in `CLAUDE.md`
  rather than the "F3 follow-up" framing.
- The decode-library choice (`zxing-wasm`) is an implementation detail, not a
  separate architectural decision — recorded here, not in its own ADR.

## References

- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
- [`CONTEXT.md`](../../CONTEXT.md) — `Nutrition Provider`, `Food Candidate`, Food
  ownership, liquid density.
- Open Food Facts API & reuse conditions:
  <https://openfoodfacts.github.io/openfoodfacts-server/api/> — rate limits,
  `User-Agent` requirement, ODbL attribution, data dumps.
- USDA FoodData Central API guide (free key, 1,000 req/hr, branded UPCs):
  <https://fdc.nal.usda.gov/api-guide/>
- `zxing-wasm` (cross-engine decode, incl. iOS WebKit): the always-on decode path.
