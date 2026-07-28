-- #96 item 4 (ADR 0010 dedupe): remember the last reminder as the user's local day
-- it went out on, not as an instant. The dedupe compares that send against the
-- latest review's date, which is already a local day -- re-deriving the send's day
-- from an instant in whatever timezone the Profile carries *now* can shift it
-- across that comparison, silently skipping a whole episode after the user moves.
-- A stored local day cannot move.
--
-- The recorded instant is deliberately NOT carried over. Converting it needs the
-- timezone that was in force at the time, and SQLite has no timezone database to
-- do it with -- date() would yield the UTC day, which for a Profile west of UTC
-- can read a day *later* than the day the user lived through. That is the one
-- direction that matters: a stamp later than the review it belongs to suppresses
-- the next episode, and keeps suppressing it, because only the user opening the
-- app unprompted can clear it -- and an unprompted user is precisely who the
-- reminder is not for. An absent value costs at most one duplicate nudge, once,
-- and is the honest reading: we do not know which day it was.
--
-- Rolling back past this migration leaves the reminder tick querying a column that
-- no longer exists -- hourly, logged, and otherwise harmless, since nothing else
-- reads it.
ALTER TABLE reminder_state ADD COLUMN last_reminder_sent_on TEXT;

ALTER TABLE reminder_state DROP COLUMN last_reminder_sent_at;
