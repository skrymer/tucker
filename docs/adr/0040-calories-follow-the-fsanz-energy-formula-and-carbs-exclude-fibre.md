# Calories follow the FSANZ energy formula, and carbs exclude fibre

A Food's calories are still derived and never entered, but the rule is now FSANZ's
energy formula instead of the three Atwater factors:
`4 × protein + 4 × carbs + 9 × fat + 2 × fibre + 7 × alcohol` kcal per gram.
Those are FSANZ's 17, 17, 37, 8 and 29 kJ/g rounded to whole kcal, and the rounded
kcal factors are the rule rather than the kJ ones. The 4/4/9 already in use are the
same rounding, so computing in kJ instead would shift every existing Food's
calories by 1–2% for no gain (the wrap below reads 246.1 kcal one way and 245.2 the
other, against a label of 246). Fibre and alcohol become macros on a Food. **Carbs** means *available*
carbohydrate with fibre excluded, which is what an Australian label's
"Carbohydrate" line states, so a User copies each line off the label as printed.

The case that forced this was a protein wrap whose label reads 19.4 g protein,
9.3 g fat, 12.8 g carbohydrate and 16.8 g fibre per 100 g, and 1026 kJ (246 kcal).
The FSANZ formula reproduces that figure: 1025.9 kJ, or 246.1 kcal by the rounded
factors. The old rule could not:
with the label's carbs it gave 213 kcal, and with Open Food Facts' carbs (29.4,
fibre folded in by whoever entered the record) it gave 279. Wine was worse. It has
no nutrition panel at all, and a 150 g glass of 13% wine derived about 16 kcal
instead of about 120.

- **Fibre and alcohol are optional, and *not stated* is not zero.** A label declares
  fibre only when it makes a fibre claim, and existing Foods have no figure, so they
  migrate to *not stated* and their calories are unchanged. An unstated figure
  contributes nothing to calories. It stays distinct from `0 g` so that, in
  **Micronutrient Intake**, fibre borrowed from a matched **Reference Food** fills
  the gap only where the Food states none. Where the Food does state fibre, the
  label's figure wins. Borrowed fibre never enters calories.
- **Alcohol is stored as grams per 100 g and written as ABV.** An Australian drink
  carries only its ABV, so the form accepts and shows ABV, and the request and
  response carry it. The backend domain converts it, using ethanol's density
  (`g/100 g = ABV × 0.789`, with the drink taken as 1 g/ml), and derives it back
  from the stored grams. The client copies the factor only for the live calorie
  preview (ADR 0002). Open Food Facts' `alcohol_100g` is % vol and converts the
  same way.
- **A Provider's stated energy now arbitrates which reading of carbs to take.**
  Carbs with fibre folded in cannot be detected from the carbs field, but the
  stated energy reveals them. If subtracting fibre reproduces the stated energy and
  the carbs as given do not, the **Food Candidate** carries carbs minus fibre. It
  shows the User both figures before they confirm, and never applies the
  adjustment silently. The comparison uses the whole derived energy, alcohol
  included. The stated energy is still never stored. This amends ADR 0006's
  "stated energy is only a cross-check".
- **A Recipe conserves its alcohol** like every other macro. Cooking drives off
  5–85% depending on method and time, which Tucker would have to ask for and could
  not check. Counting all of it errs towards more calories, by tens of kcal per
  portion for wine in a stew.

## Considered options

- **Total carbohydrate, fibre included, with fibre subtracted at 2 kcal/g.** This
  matches US labels and USDA's "carbohydrate, by difference". Rejected because every
  User is in Australia and would have to add two label lines together to enter one
  figure.
- **Take Provider carbs as given and rely on the User noticing the cross-check.**
  That was the behaviour before this decision, and it is how the 279 kcal wrap got
  through.
- **Store ABV.** ABV and grams convert both ways through one constant, so storing
  ABV gains nothing. It would give the calorie rule and a Recipe's roll-up a second
  unit.
- **A fixed alcohol-retention factor for cooked Recipes**, such as USDA's 25% for
  simmered dishes. More accurate for a stew, but wrong for anything added after
  cooking, and it would be a guess dressed up as a constant.
