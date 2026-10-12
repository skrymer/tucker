-- Every Entry read names its owner, so idx_entry_user_logged_on (V22) serves them
-- all and the day-only index is write cost that no query reads.
DROP INDEX idx_entry_logged_on;
