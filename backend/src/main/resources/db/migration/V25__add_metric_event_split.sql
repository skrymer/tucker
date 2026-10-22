-- Where a route change spent its time (ADR 0038): the wall time it waited on /api,
-- the part of that the server spent working, and whether it was the route's first
-- visit this page load. Every route change carries all three, so the rows stored
-- before them, which can never be split, are removed rather than kept beside the
-- rest. Metrics are lossy by design, and none of these had been deployed.
-- Nullable because a later kind (lcp, inp) carries none of the three, and making
-- them NOT NULL now would mean rebuilding the table to widen them then. Guarded
-- here as V24 guards its columns, a CHECK passing on NULL.
DELETE FROM metric_event;

ALTER TABLE metric_event ADD COLUMN api_ms INTEGER CHECK (api_ms >= 0);
ALTER TABLE metric_event ADD COLUMN server_ms INTEGER CHECK (server_ms >= 0);
ALTER TABLE metric_event ADD COLUMN first_visit INTEGER CHECK (first_visit IN (0, 1));
