-- Every Entry read is scoped to one User (ADR 0021), so the index leads with the
-- owner. A User's days in a range, and their earliest day, become a seek into
-- their own rows rather than a walk over every User's.
CREATE INDEX idx_entry_user_logged_on ON entry (user_id, logged_on);
