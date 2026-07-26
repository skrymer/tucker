# Open Food Facts stub for the real-stack smokes

The `barcode-lookup` smoke proves **Tucker's** pipeline — barcode → provider
lookup → normalised **Food Candidate** → confirmation → a **Food** whose calories
are Atwater-derived from macros. Whether `world.openfoodfacts.org` happens to be
up is not Tucker behaviour, and it should not gate Tucker's CI (issue
[#163](https://github.com/skrymer/tucker/issues/163) — a slow OFF reddened a
documentation-only PR).

So the smoke stack serves this directory as a static site and points the backend's
`tucker.providers.open-food-facts.base-url` at it (see `docker-compose.smoke.yml`).
The directory layout mirrors OFF's URL space, so nginx answers the provider's real
request path:

```
api/v2/product/3017620422003.json   →  GET /api/v2/product/{barcode}.json
```

Only the far side of the network boundary becomes deterministic. Everything on
Tucker's side — the HTTP call, the JSON → per-100g mapping, the Atwater
re-derivation, the confirmation step — stays under test. A barcode with no file
here 404s, which is exactly how OFF answers a miss, so the miss case keeps working
unchanged.

## The reserved barcode that answers nothing

`5030000000503` is **not a product and never will be**. The stub refuses it with a
`503`, via `../off-stub.conf` (mounted over nginx's default server). It exists so a
smoke can drive a genuine **Inconclusive Lookup**
([#164](https://github.com/skrymer/tucker/issues/164)) — a provider that cannot
answer — all the way through the real chain, rather than only against a mocked
Provider bean.

That distinction is the whole point: "there is no answer" and "the answer is no"
used to be
indistinguishable _because_ the signal died between the provider and the
controller, so a test that stubs the provider proves nothing about it. Keep this
barcode out of every other fixture.

On the TypeScript side it is exported once, from
[`../../support/off-stub.ts`](../../support/off-stub.ts), alongside the
allowed-error pattern a deliberately-induced 503 needs. Import it from there
rather than retyping the digits — that leaves exactly two things to keep in step,
that module and `off-stub.conf`.

## Provenance

`api/v2/product/3017620422003.json` is a **real Open Food Facts response**, not an
invented payload. It was recorded on 2026-07-25 with:

```sh
curl -A "Tucker/1.0 (personal diet tracker; +https://github.com/skrymer/tucker)" \
  "https://world.openfoodfacts.org/api/v2/product/3017620422003.json?fields=product_name,nutriments"
```

The barcode is Nutella, one of the most-scanned products in OFF. The body is
verbatim apart from being pretty-printed for readability; it is listed in
`.prettierignore` so no formatter rewrites a recorded third-party response.

Note the file is served for _any_ query string, so it stands in for the provider's
`?fields=` request without the stub having to implement field selection.

Data from Open Food Facts, licensed under the
[ODbL](https://opendatacommons.org/licenses/odbl/1-0/).
