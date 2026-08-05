-- F10 slice 3 (issue #157): a barcode is unique per User, not globally.
--
-- CONTEXT.md used to promise a shared product catalog, one row per barcode,
-- identical for everyone. ADR 0021 reversed that: every Food belongs to exactly
-- one User, so the same product may exist once per person and correcting its
-- macros changes it for its owner alone. The global index is the last piece of
-- the old promise still enforced by the schema.
--
-- Scanning something another User has already scanned stays instant regardless.
-- What is shared is the per-barcode *lookup* cache (ADR 0006) -- it caches what a
-- Nutrition Provider said about a product, which is not anybody's data -- and
-- what that lookup produces is a Food owned by whoever scanned it.
--
-- A plain index swap, with no table rebuild: idx_food_barcode is a named index
-- rather than a column constraint, so it can simply be dropped and replaced. The
-- rebuilds ADR 0021 still owes -- profile losing CHECK (id = 1), and
-- weight_measurement and weekly_review losing their global UNIQUE -- are
-- table-level and cannot be done this cheaply. They come in slices 4 and 5, and
-- carry user_id's NOT NULL with them.
DROP INDEX idx_food_barcode;

-- Partial, exactly as before: a Food may have no barcode at all (hand-entered,
-- or a Recipe), and SQLite treats every NULL as distinct anyway -- the WHERE
-- clause keeps those rows out of the index rather than relying on that.
CREATE UNIQUE INDEX idx_food_user_barcode
    ON food (user_id, barcode) WHERE barcode IS NOT NULL;
