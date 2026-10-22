-- The browser engine and OS a metric was measured in, derived on the server from the
-- request's user agent, which is itself never stored (ADR 0038).
-- Every event carries both, but SQLite cannot add a NOT NULL column without a default,
-- and a default would label a row nobody classified. Nullable, then, with the domain
-- type guaranteeing every write, and guarded here as V24 and V25 guard their columns.
ALTER TABLE metric_event ADD COLUMN engine TEXT
    CHECK (engine IN ('webkit', 'blink', 'gecko', 'other'));
ALTER TABLE metric_event ADD COLUMN os TEXT
    CHECK (os IN ('ios', 'android', 'macos', 'windows', 'linux', 'other'));
