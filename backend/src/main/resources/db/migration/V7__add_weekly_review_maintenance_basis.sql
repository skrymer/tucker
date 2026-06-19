-- #130 (ADR 0002): the Weekly Review's Maintenance Basis -- how that week's
-- Maintenance was derived (FORMULA_SEED / ADAPTIVE / HELD) -- is derived domain
-- state that used to leak only inside the human-readable note. Promote it to a
-- structured column so the API exposes it as a field and the frontend stops
-- parsing prose. Add it with a default so existing rows stay valid, backfill the
-- non-default cases from the note each was stamped with (a review is irreversible
-- history, so keep it honest), then drop the now-redundant note. The default
-- FORMULA_SEED covers null or unrecognised notes, the safe cold-start value.
ALTER TABLE weekly_review ADD COLUMN maintenance_basis TEXT NOT NULL DEFAULT 'FORMULA_SEED';

UPDATE weekly_review SET maintenance_basis = 'ADAPTIVE' WHERE note LIKE '%ADAPTIVE%';
UPDATE weekly_review SET maintenance_basis = 'HELD' WHERE note LIKE '%HELD%';

ALTER TABLE weekly_review DROP COLUMN note;
