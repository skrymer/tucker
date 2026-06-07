-- F6 slice 2 (issue #81): widen the single-row Profile to carry the user's
-- locale and Weekly-Review Reminder preferences (CONTEXT.md Profile). The
-- timezone is the IANA zone that defines the user's local day, reminder_hour is
-- the local hour to nudge at, and reminders_enabled is the user's opt-in.
-- Existing rows take the safe defaults (UTC, 09:00, off) until the user
-- captures their own. The 0..23 and boolean ranges are enforced by the domain
-- Profile (SQLite ALTER TABLE ADD COLUMN cannot attach a CHECK here).
ALTER TABLE profile ADD COLUMN timezone          TEXT    NOT NULL DEFAULT 'UTC';
ALTER TABLE profile ADD COLUMN reminder_hour     INTEGER NOT NULL DEFAULT 9;
ALTER TABLE profile ADD COLUMN reminders_enabled INTEGER NOT NULL DEFAULT 0;
