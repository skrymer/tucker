# Logging is its own destination

F2 shipped logging as a sheet opened from **Today** — a header button on desktop,
a FAB on phone — and F3 gave `/foods` a row tap that logs the Food it names, as a
shortcut. In real use the shortcut won outright: every Entry was being created
from the catalog, and the affordance built for the job went unused.

This ADR records what that revealed and what was decided about it, settled in a
design interview off the back of a throwaway three-variant UI prototype. The
domain term it introduces (**Frequent Foods**) lives in
[`CONTEXT.md`](../../CONTEXT.md).

## The picker had already lost once

`WeighedEntryForm` picks a Food with a `USelectMenu`, and it deliberately
suppresses the on-screen keyboard — `inputmode: 'none'`, commented *"the catalog
is short enough to scroll, and on a phone the keyboard covers the list it is
meant to filter."* Somebody had already diagnosed half of this and stopped the
picker asking the user to type.

It still lost. So the friction is not typing, and a search box is not the fix.
What the catalog page has that a picker inside a sheet does not is **height** (a
full page of rows against a popover nested in an overlay), **information** (the
row carries calories, protein and the Recipe badge; the picker carries a bare
name), and **one tap** (the row *is* the action, where the picker is open →
scroll → select → then grams).

That reframes "show the top 10" from a convenience into the actual fix: rank the
list well enough and its height stops mattering.

## Three structures, and why the third tab won

The prototype rendered three variants of the same proposed shell at a 412px
viewport, holding the navigation constant so the only variable was where logging
lives:

- **A — the catalog, ranked.** Status quo plus a Frequent section; `/foods` stays
  both catalog and log surface.
- **B — a Log destination.** Logging becomes a primary tab; `/foods` is demoted.
- **C — the sheet becomes the list.** Today's sheet swaps its picker for the same
  tappable rows.

**B won**, and the reason is narrower than the tab: its two-column grid fits all
ten Foods on one phone screen **without scrolling**, where A and C both scroll for
the same ten. A full-width row spends 400px of width rendering thirty characters
of name. The grid is what makes the ranked list pay off.

Two things settled it beyond the layout. B is the only variant where **"Log an
estimate instead" is a peer** of picking a Food — an **Estimated Entry** has no
Food, so `/foods` has nowhere to put it and A strands it back on Today, splitting
one job across two screens by entry *kind*, which is the worst available split.
And C, though it worked better than expected (`ResponsiveOverlay` is already
`max-h-[90dvh]`, so the cramped-scroller risk never materialised), buries Today
behind a dim for a screen opened ten times a day.

## The catalog is only a catalog

`/foods` stops logging entirely. Not just the row tap: the **"log it now"
continuation** that `AddSheet` pivots into after saving a new Food goes with it.

That continuation exists for a real case — scan a barcode in the kitchen, save,
eat it — and killing it makes a brand-new Food a round trip through the `More`
menu. It goes anyway, because the alternative is keeping a second way to create an
Entry alive purely for the minutes after a Food is created, and one logging
surface was the entire point of the change.

The reverse move was considered and rejected: giving the **Log** tab its own "Add
a food" so creation happens where logging does. Registering Foods is a burst of
activity when a user starts, and near-zero once their rotation is in the catalog.
Optimising the navigation for it would trade a permanent muddle for a temporary
convenience. Creating a Food is catalog work and stays on `/foods`; **Log** picks
from what exists.

The cost is that a User with an empty catalog lands on their primary logging
destination and finds a dead end. **Log**'s empty state hands them to `/foods`
with the Add sheet open — the job `FoodEmptyState` already does for the Weighed
tab's empty-catalog case.

Today loses its log affordance in both forms, header button and FAB. It keeps
deleting a mislogged Entry: that is undoing something visible on the page, not a
second way in.

## Frequent Foods

Ranked by how many **Entries** name a Food in the **trailing 30 days**, ties
broken by the most recently logged, capped at ten.

Thirty days so a weekly staple clears four appearances while a Food dropped a
month ago falls out. An all-time count ossifies — the Food eaten every morning for
three months stays first forever after the user stops eating it — and pure recency
loses the staples after a single varied day. A decay curve behaves better than
either and costs an arbitrary half-life constant nobody can defend; Tucker's house
style is explicit windows (ADR 0018's fourteen days, ADR 0026's seven), not tuning
parameters.

A window with no Entries yields **no** Frequent Foods, rather than falling back to
a longer window, because a fallback would present a stale rotation as a current
one.

The ten is a fact about the grid, not about the domain, and the ranking is
computed by the backend per
[ADR 0002](0002-business-logic-belongs-in-the-backend.md) — the client is handed an
ordered list.

It does not violate the **no-good-or-bad rule**
([ADR 0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md)): it
ranks how often the user reached for a Food, which is a fact about their own
behaviour, and says nothing about the Food. It is also not an **Intake Breakdown**
under another name — that ranks by the calories a Food contributed, this by count,
and they disagree constantly. Olive oil is logged daily and contributes little; one
restaurant meal is the reverse.

## The tail is found by filtering, not by scrolling

The grid answers the common case and says nothing about the other fifty Foods. A
catalog past sixty entries makes "find the tinned tuna" an alphabetical scroll on
a phone, which is the friction this ADR set out to remove, relocated rather than
fixed.

So the full catalog stays below the grid, with a **search field above it that
filters in place**. That is not a reversal of the picker's defeat: the
`USelectMenu` lost because it made typing the price of admission — open a popover,
commit to a search box, and only then see anything. A filter field on a
full-height page costs nothing when ignored, and the grid means it is ignored most
days.

A non-empty query collapses both sections into one flat result list. Leaving ten
unrelated Frequent Foods above the matches would answer a question the user has
stopped asking.

Non-empty means non-**blank**: a query of whitespace alone is not a question, and
treating it as one would collapse the grid the moment a thumb brushed the space
bar. The filter and the collapse have to agree on that, or the page holds two
answers to what a query is. Matching folds case and accents on both sides for the
same reason — a Food nobody can spell twice the same way is a Food this section
cannot reach, which is the friction it exists to remove.

## Three primary destinations and a fixed More

The tab bar carries **Today · Log · Review**. **Foods**, **Check** and **Profile**
move behind **More**.

That is one set of destinations in two shapes, because the constraint is the tab
bar's and not the side rail's: on a phone `More` is the fourth tab and opens a
sheet, while the desktop rail has the room and lays the same three out in place
under a `More` heading, with no button to press. A rail that hid three links
behind a menu would be paying a cost it does not have.

With **Calorie Tracking** off, Log, Foods and Check all disappear — their whole
subject is the log — leaving Today · Review and a `More` holding **Profile
alone**. A menu wrapping a single link is not tidy, and it is kept anyway: the
alternative promotes Profile into the bar, so toggling one setting both removes
Log *and* moves Profile, two changes to relearn instead of one. Profile being
findable in the same place regardless of what a User tracks is worth more than the
vestigial menu. This is navigation, not access control — every hidden route stays
reachable, as `visibleDestinations` already establishes.

## This reverses ADR 0022 on Check's tab

[ADR 0022](0022-a-check-states-cost-and-return-and-never-labels-a-food.md) gave
**Check** a nav tab of its own, explicitly amending ADR 0006's "one mount point /
no new nav tab" to do it, on the reasoning that *in a shop, one-handed
reachability decides it*. That argument was sound and the feature it predicted did
not materialise: Check is hardly used, and it is now paying for a tab out of a
budget of three.

So Check moves into `More`, and **that is its entry point** — not a holding
position pending a better one. The shop argument is answered by observation
rather than by argument: reachability is worth a tab only in proportion to how
often the thing is reached for, and this one is not reached for. A Check now costs
one extra tap, taken while standing still with a package in hand, which is the
cheapest moment in the flow to spend it.

The 0022 reasoning is left intact and cited rather than deleted, because it
becomes right again the day Check is used enough to earn the tab back. What
changed is the usage, not the logic.

## Consequences

- `LogFoodSheet` is deleted. With it goes the one path that created an Entry
  **without a Budget Projection** — `LogEntrySheet` runs both its forms through
  `useBudgetGate` and the `/foods` row tap ran through nothing, so the surface
  actually in use was the one that never warned. The restructure closes that by
  removing the path rather than by adding a guard to it.
- The Log destination needs the backend to rank Frequent Foods; the client sorts
  nothing.
- `navigation.ts` documents "Tucker's five primary destinations" and justifies
  Check's tab. Both statements stop being true.
- Today becomes read-only for Entries. Its `LogEntrySheet` and the components
  under it move to the new destination rather than being rewritten — the Weighed
  path loses its picker, the Estimated path is unchanged.
