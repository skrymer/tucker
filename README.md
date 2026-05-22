# Tucker

A personal diet tracker. Log the food you eat, track calories and protein, and
work toward a weight-loss goal that adapts to your real results.

## How it works

- **Log food.** Add a food by scanning its barcode (looked up in Open Food
  Facts), entering it by hand, or building a Recipe from ingredients. Weigh your
  portion in grams and the app records its calories and protein. Meals you can't
  weigh — restaurants, eating out — go in as a flagged estimate.
- **Set a goal.** Choose a target weight and a rate of loss. Tucker derives your
  daily calorie budget and a protein floor of 2 g per kg of body weight.
- **It adapts.** Each week Tucker recalculates your maintenance calories from
  your smoothed weight trend and what you actually logged, then updates the
  budget — so a wrong starting estimate corrects itself instead of stalling you.

Tucker runs as a phone web app (PWA).

## Not in scope yet

WhatsApp-based logging and training-day-aware diet planning were part of the
original concept. Both are deferred until the core tracker is solid.

## Documentation

- [`CONTEXT.md`](./CONTEXT.md) — the domain language and how the concepts relate.
