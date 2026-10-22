-- The browser engine and OS a metric was measured in, derived on the server from the
-- request's user agent, which is itself never stored (ADR 0038). Every metric names
-- both, so the rows stored before them, which can never be classified, are removed
-- rather than kept beside the rest, as V25 removed the rows it could not split.
-- Nullable only because SQLite cannot add a NOT NULL column without a default, and a
-- default would label a row nobody classified. Guarded as V24 and V25 guard theirs.
DELETE FROM metric_event;

ALTER TABLE metric_event ADD COLUMN engine TEXT
    CHECK (engine IN ('webkit', 'blink', 'gecko', 'other'));
ALTER TABLE metric_event ADD COLUMN os TEXT
    CHECK (os IN ('ios', 'android', 'macos', 'windows', 'linux', 'other'));
