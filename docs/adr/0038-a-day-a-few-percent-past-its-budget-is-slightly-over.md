# A day a few percent past its Budget is slightly over, not over budget

A day whose intake exceeds the **Calorie Budget** by no more than the **Tolerance**
(10% of the Budget, so exactly 110% is still inside it) earns its own verdict,
**slightly over**, shown in warning amber rather than error red. Only a day past
the Tolerance is **over budget**. The Budget is an estimate the next **Weekly
Review** corrects, so a few percent over it is noise. Painting that noise the same
red as a blown day taught Users that a near-miss and a binge are the same thing.

The Tolerance grades a day. It does not move the Budget. A **Budget Projection**
still warns at the Budget itself, so the heads-up comes before the first calorie
past it, and **on-target** still means at or under the Budget with the **Protein
Floor** met. Both over-states are about calories alone. A slightly-over day with
the Protein Floor met is not on-target.

This amends ADR 0029: the Weight Timeline's per-day `overBudget: Boolean` becomes
`budgetVerdict` (`within-budget` / `slightly-over` / `over-budget`, or `null` with
no Budget or no Entries). It is still the backend's verdict, and it comes from the
same domain comparison as a day's **Day Status**, so the ring, the verdict pill and
the bar cannot disagree. It is calorie-only, unlike Day Status, because the bars
have never been about protein.

## Considered options

- **A colour band in the frontend only.** The ring and the chart would compute
  `intake ≤ 1.1 × Budget` themselves. Rejected under ADR 0002: it repeats a domain
  comparison in two components, and the two answers ADR 0029 exists to prevent
  could disagree.
- **A per-User Tolerance on the Profile.** Rejected: it means a setting, a field
  and a migration, all to let a User redefine a blown day. It can be added later.
- **A flat number of calories** (say 150 kcal). Rejected because the engine's
  error scales with the Budget, so the grace should too.
- **Counting slightly over as on-target.** Rejected because on-target would then
  claim the Budget was kept when it wasn't. Amber says *close*. It doesn't say
  *done*.

## Consequences

The light-mode `--ui-warning` ink was 2.59:1 on the white card, under the 3:1 a
ring arc, a chart bar and the large centre figure need. It is darkened app-wide
rather than given a ring-only token, so warning stays one ink. The exact hex is
chosen live on `/design` against the coral protein arc (see `frontend/DESIGN.md`).
