# A Check states cost and return, and never labels a Food

F8 gave barcode scanning exactly one purpose: create a **Food**. But the decision
a user most often faces with a package in their hand happens earlier and
elsewhere — standing in a shop, deciding whether to *buy* it at all. That
question is answered before anything is logged, before a Food exists, and
possibly for a product that never enters the catalog.

This ADR records the design of that second use of a scan, settled in a design
interview off the back of a throwaway UI prototype. The domain terms it
introduces (**Check**, **Pace**) live in [`CONTEXT.md`](../../CONTEXT.md).

## Tucker does not tell you a food is bad

The prototype opened with a verdict — *Good choice* / *Bad choice* — driven by
how much protein a food returns per calorie. It was legible, and it was wrong.

Two reasons, and the first is the app's own logic. `CONTEXT.md` already says a
day is **on-target** once the Protein Floor is met and intake is at or under the
Calorie Budget, and that *"an in-progress day in neither state has no verdict —
being under the floor mid-day isn't a failure, the day just isn't finished."*
Tucker's unit of judgement is the **day**, and it deliberately withholds one when
the picture is incomplete. A single food is exactly as unfinished as a mid-day:
100 g of Nutella reads badly alone and is perfectly on-target eaten on skyr. The
thing that must average out is the day, not each item in it.

The second reason is that the label is counter-productive even where it is
accurate. An app that calls foods bad teaches avoidance and guilt about
ingredients, which is not what a deterministic tracker is for.

So a **Check** states two figures and a consequence, and stops:

> 100 g **costs** 21% of your calories and **returns** 4% of your protein floor.
> Balance it with ~30 g of protein elsewhere today.

Every term traces to a target the user already has. The user draws the
conclusion. This is recorded as a standing rule in `CONTEXT.md` — **no Food is
good or bad** — because it constrains more than this one screen.

## Pace comes from the user's own targets

"Below par on protein" needs a threshold, and any fixed number would be
invented. The user's two targets already imply one: to reach a **Protein Floor**
inside a **Calorie Budget**, the day must average

```
Pace = Protein Floor ÷ Calorie Budget × 100      (g protein per 100 kcal)
```

170 g inside 2492 kcal is 6.8 g per 100 kcal. A food below pace spends calories
faster than it returns protein, so the rest of the day must make up the
difference — a derived fact about the user's targets rather than an opinion about
the food.

**Pace moves with the deficit, and that is the point.** A steeper Goal tightens it
(fewer calories, the same floor); **Maintenance Mode** eases it. When calories are
scarce each one must work harder for protein, so the bar genuinely should rise.
The accepted consequence is that a product's figures can change after a **Weekly
Review** without the product changing; pace is shown on screen so the answer —
*your targets moved, not the food* — is available rather than mysterious. We
considered pinning pace to **Maintenance** so a deficit couldn't tighten it, and
rejected it: it would understate what a food costs precisely when the user can
least afford it.

Pace is deliberately **not** called "protein density". Density already means mass
per volume in this glossary (a **Recipe**'s cooked weight, and the 1 g/ml rule for
per-100ml provider values), and overloading it would break the language.

**Protein is the only axis.** Tucker is **diet-agnostic** — keto, low-fat and
low-carb all track identically — because protein is the lever for retaining
muscle while losing fat, and it is the only macro the app sets a target for.
Grading on fat or sugar would mean importing nutrition ideology Tucker has no
basis for. The macro split is shown so the user can apply their own judgement;
Tucker shows, the user decides.

## A Check weighs the whole day, never what's left

Cost and return are shares of the full **Calorie Budget** and **Protein Floor**,
not of what remains right now. *Is this worth buying* must give the same answer at
9am and 8pm; a denominator that shrinks through the day would make the same
product score differently depending on when the user happened to be in the shop.

"Can I fit this into what's left?" is a good question — it is simply a different
one, belonging to **logging** a Food before eating it rather than shopping for
one. It is deferred to the log-entry flow, where the day's remaining room is
already the natural frame.

The portion is user-chosen (nobody eats 100 g of Nutella; 100 g of tuna is a
normal serving), which exposes a useful property: cost and return both scale
linearly with grams, so their **ratio cancels grams entirely**. Sliding the
portion changes how much of the day a food takes; it never changes what kind of
food it is. Hence pace sits still in text while the rings move — and stays legible
at 20 g, where both arcs shrink to slivers and stop communicating.

Provider serving sizes were considered as the reference and rejected on the data:
of five real products, Open Food Facts had no serving size for Nutella or tuna,
and claimed "100 g" for a Mars bar (~51 g). A default that is silently wrong on
the products where it matters is worse than a default the user sets.

## Nothing is saved, and it needs a Budget to exist

A Check creates no **Food** and no **Entry**. It is read and discarded. Deciding
to buy something is not deciding to eat it, and a catalog full of products the
user considered would be noise.

It is also **gated behind having a Calorie Budget**, reusing the same
`SetupBanner` path as `/today`. Every figure is a share of the Budget or the
Floor; with neither, the only options are to invent a denominator or to say so.
Inventing one would state confident nonsense about a product the user is deciding
to buy, which is the worst possible place to guess.

## Placement, endpoint, and failure

- **Its own nav tab** (Today / Foods / **Check** / Review / Profile). This amends
  [0006](0006-provider-agnostic-nutrition-lookup.md), which scoped the scanner to
  the Add-Food flow with "no new nav tab" — see the amendment there. Folding a
  Check into the Add-Food flow would technically honour that rule while telling
  the user the opposite of the truth, since the whole point is that it creates
  nothing. In a shop, one-handed reachability decides it.
- **`GET /api/check/{barcode}`**, its own resource. This is not the "UI bundle"
  that per-aggregate endpoints exist to prevent: `/api/setup` would have been
  named after a screen, whereas a Check is a term in `CONTEXT.md` with its own
  definition and invariants. The test — *if the screen were deleted, would this
  still be a meaningful thing to ask the backend?* — passes. It returns the
  portion-invariant rules (pace, the food's protein per 100 kcal, the day's
  allowance in grams, the whole-day protein shortfall); the client scales cost and
  return by grams, which is presentation of already-derived values in the same
  class as the Day Ring's arc sweep, not a re-derived rule
  ([0002](0002-business-logic-belongs-in-the-backend.md)).
- **The camera is the only way into a Check, and a failed lookup shows an error.**
  No typed barcode, no hand-entered macros — scan or nothing.

  **This narrows nothing in the Add-Food flow.**
  [0006](0006-provider-agnostic-nutrition-lookup.md) keeps every manual path it
  specifies: manual barcode entry stays a *permanent peer* to the camera there,
  manual macro entry stays an always-on peer, and a provider miss still lands on
  a barcode-pre-filled form. Nothing below is an argument for removing them.

  The difference is what each flow produces. Add-Food always ends in a **Food**
  worth creating, so a manual path is worth real effort and must exist for a
  denied camera or a product the provider has never heard of. A Check ends in
  nothing — it is a question, not a creation — so typing three macros off a label
  one-handed in an aisle costs more than the answer is worth, when the user can
  abandon the decision for free. If the scan doesn't work they simply move on,
  which is a perfectly good outcome for a purchase they had not committed to.

  **Accepted consequence:** a denied or absent camera makes *this tab*
  unavailable, with no degraded mode. Add-Food remains fully usable without a
  camera. That is the honest trade for keeping a Check a two-second interaction.

  It also makes the error message the *entire* failure experience, which makes
  [#164](https://github.com/skrymer/tucker/issues/164) a **prerequisite**: a
  provider outage and a genuine miss are currently indistinguishable, yet they
  need opposite advice — *retry in a moment* versus *this product will never
  resolve*.

## Consequences

- **Backend:** a `Check` resource at `…/check/{barcode}` composing the existing
  provider lookup with the day's targets; **Pace** as a derived value (also worth
  exposing on the daily summary, since it is a property of the day's targets);
  the whole thing undefined without a Calorie Budget.
- **Frontend:** a fifth nav tab; a scan surface hosting the existing decoder at a
  second mount point; the cost/return presentation with a portion slider capped at
  a realistic eating range rather than the day's allowance; the `SetupBanner` gate.
- **Scan volume rises sharply.** Comparing options on a shelf is 5–10 lookups in
  minutes, against Open Food Facts' ~15 product reads/min per IP. The shared
  per-barcode cache from [0006](0006-provider-agnostic-nutrition-lookup.md)
  absorbs re-scans, and a throttle stays **deferred** — but a Check is the trigger
  condition that would justify one, recorded here so it is not rediscovered.
- **No Food is good or bad** and **diet-agnostic** are now standing rules in
  `CONTEXT.md`, constraining every future surface, not just this one.
- Substantial enough for its own **F-number** (F11) rather than an F8 follow-up.

## References

- [0002 — business logic belongs in the backend](0002-business-logic-belongs-in-the-backend.md)
- [0006 — provider-agnostic nutrition lookup](0006-provider-agnostic-nutrition-lookup.md)
  — the first scanner mount point, amended by this ADR.
- [`CONTEXT.md`](../../CONTEXT.md) — **Check**, **Pace**, **Calorie Budget**,
  **Protein Floor**, the no-good-or-bad and diet-agnostic rules.
- [#164](https://github.com/skrymer/tucker/issues/164) — distinguishing a provider
  outage from a genuine miss; a prerequisite for this feature's error state.
