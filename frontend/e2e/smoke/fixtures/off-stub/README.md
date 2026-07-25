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
