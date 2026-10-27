-- A Food states its dietary fibre per 100 g, optionally (ADR 0040). Null is "not
-- stated", which is not zero, so every existing Food reads null and keeps the calories
-- it was stored with - an unstated fibre contributes none.
ALTER TABLE food ADD COLUMN fibre_per_100g REAL;
