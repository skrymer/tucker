-- A Food states its alcohol per 100 g, optionally, as grams - ABV is only how it is
-- written (ADR 0040). Null is "not stated", which is not zero, so every existing Food
-- reads null and keeps the calories it was stored with - an unstated alcohol contributes none.
ALTER TABLE food ADD COLUMN alcohol_per_100g REAL;
