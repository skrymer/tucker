-- A measurement of Tucker itself, sent by a browser (ADR 0038). Tucker's rather
-- than a User's, so it has no user_id: the app_config-style exception ADR 0021
-- names. Nor does anything else here say who sent it, the raw user agent included.
-- kind carries no CHECK, as later slices add kinds and widening one is a rebuild.
CREATE TABLE metric_event (
    id          INTEGER PRIMARY KEY,
    kind        TEXT    NOT NULL,
    route       TEXT    NOT NULL,
    value_ms    INTEGER NOT NULL,
    layout      TEXT    NOT NULL CHECK (layout IN ('phone', 'desktop')),
    installed   INTEGER NOT NULL CHECK (installed IN (0, 1)),
    app_version TEXT    NOT NULL,
    recorded_at TEXT    NOT NULL
);

CREATE INDEX idx_metric_event_recorded_at ON metric_event (recorded_at);
