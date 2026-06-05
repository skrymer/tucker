-- F7 slice 2 (ADR 0008): a Goal is *reached* when the live Trend Weight first
-- meets its target. The crossing is stamped here, once, on a Weight-Measurement
-- write and never unset while the Goal is active (the latch), so the reached
-- banner doesn't flicker as the trend wobbles around target. Nullable: an
-- unreached or never-to-be-reached Goal carries NULL.
ALTER TABLE goal ADD COLUMN reached_on TEXT;
