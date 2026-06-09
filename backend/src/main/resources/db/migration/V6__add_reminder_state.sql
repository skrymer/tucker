-- F6 slice 3 (reminder cron and sender): single-row bookkeeping for the
-- Weekly-Review Reminder. It is deliberately its own table, not part of the
-- Profile and not in app_config. It is runtime state, not a user preference, so
-- it must not leak through PUT /api/profile, and unlike app_config (which a smoke
-- reset preserves so the VAPID key survives) it must be cleared on reset so each
-- smoke starts in the absent state. last_seen_on feeds the absent-today gate,
-- stamped on the daily-summary read. last_reminder_sent_at feeds the per-episode
-- dedupe (ADR 0010). Both stay null until first written. ISO-8601 text, matching
-- how the rest of the schema stores dates and instants.
CREATE TABLE reminder_state (
    id                    INTEGER PRIMARY KEY,
    last_seen_on          TEXT,
    last_reminder_sent_at TEXT
);
