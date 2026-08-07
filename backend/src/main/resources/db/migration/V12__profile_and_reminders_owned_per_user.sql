-- F10 slice 5 (issue #159): the Profile and the Weekly-Review Reminder become one
-- person's rather than the installation's. See ADR 0021 (every row is owned by
-- exactly one User) and ADR 0010 (the reminder's firing rule, which this makes
-- per User).
--
-- Three rebuilds, for two different reasons. profile carries CHECK (id = 1) and
-- reminder_state is keyed as a single row, so neither can hold a second person
-- without being rewritten. push_subscription needs no widening -- its endpoint
-- stays globally unique, deliberately, see below -- and is rebuilt only so that
-- every table this slice scopes ends the slice with a NOT NULL owner, which is
-- the rule V11 set for goal.
--
-- None of the three is *referenced* by anything, so per ADR 0021's "What a
-- rebuild actually costs" the foreign-key dance is not needed: foreign keys stay
-- enforced throughout and this runs inside Flyway's transaction like every other
-- migration. PerUserUniquenessMigrationTest asserts that premise against the
-- schema rather than trusting this comment.
--
-- POLICY FOR ALL THREE ADOPTIONS BELOW, unchanged from V11. A row with no owner
-- was written between V9 (which added user_id, nullable) and here, by an app that
-- had not yet learned to stamp one. Those rows are **adopted, never discarded**,
-- because it is *this* slice that scopes the repositories reading them: until it
-- runs they are fully live. An unowned Profile is the body the Maintenance seed
-- is computed from, an unowned reminder_state holds the dedupe standing between
-- its owner and a duplicate nudge, and an unowned push_subscription is a device
-- that would simply stop being reminded, with nothing on any screen to say so --
-- the browser's own subscription survives, so the toggle still reads "on".
--
-- Adoption is guarded on there being exactly one User, which is every database
-- that can hold an unowned row: the second User is not invited until issue #161.
-- With none or several, attribution would be a guess, so nothing is adopted and
-- the NOT NULL below refuses the migration -- a boot failure a human resolves,
-- inside a transaction that rolls back cleanly.
UPDATE profile
   SET user_id = (SELECT id FROM user)
 WHERE user_id IS NULL
   AND (SELECT count(*) FROM user) = 1;

-- Rebuilt to say that a Profile is one person's body and preferences, not the
-- app's settings row. Column order matches the table it replaces (user_id last,
-- where V9's ALTER put it) so the generated jOOQ record is unchanged apart from
-- the constraints. The surrogate id is kept and left a plain rowid alias: nothing
-- references it and nothing exposes it, but a Profile keyed on user_id alone
-- would be an INTEGER PRIMARY KEY, and SQLite auto-assigns a rowid to one of
-- those when it is given NULL -- so an insert that forgot the owner would be
-- handed a plausible one instead of being refused.
CREATE TABLE profile_new (
    id                INTEGER PRIMARY KEY,
    sex               TEXT    NOT NULL CHECK (sex IN ('MALE', 'FEMALE')),
    birth_date        TEXT    NOT NULL,
    height_cm         REAL    NOT NULL CHECK (height_cm > 0),
    timezone          TEXT    NOT NULL DEFAULT 'UTC',
    reminder_hour     INTEGER NOT NULL DEFAULT 9,
    reminders_enabled INTEGER NOT NULL DEFAULT 0,
    user_id           INTEGER NOT NULL REFERENCES user (id)
);

INSERT INTO profile_new (id, sex, birth_date, height_cm, timezone, reminder_hour,
                         reminders_enabled, user_id)
SELECT id, sex, birth_date, height_cm, timezone, reminder_hour,
       reminders_enabled, user_id FROM profile;

DROP TABLE profile;

ALTER TABLE profile_new RENAME TO profile;

-- One Profile each. This is what CHECK (id = 1) used to say globally, and it is
-- load-bearing rather than tidy: the Maintenance seed is computed from sex, age
-- and height, so a second Profile for one person would be a second answer to
-- "how big is this person" with nothing choosing between them.
CREATE UNIQUE INDEX idx_profile_user ON profile (user_id);

UPDATE reminder_state
   SET user_id = (SELECT id FROM user)
 WHERE user_id IS NULL
   AND (SELECT count(*) FROM user) = 1;

-- Rebuilt for the same reason, arrived at differently: reminder_state was never
-- constrained to one row, it was simply always written as id 1. So this rebuild
-- buys NOT NULL, and the index below is what actually makes the row per person.
CREATE TABLE reminder_state_new (
    id                     INTEGER PRIMARY KEY,
    last_seen_on           TEXT,
    last_reminder_sent_on  TEXT,
    user_id                INTEGER NOT NULL REFERENCES user (id)
);

INSERT INTO reminder_state_new (id, last_seen_on, last_reminder_sent_on, user_id)
SELECT id, last_seen_on, last_reminder_sent_on, user_id FROM reminder_state;

DROP TABLE reminder_state;

ALTER TABLE reminder_state_new RENAME TO reminder_state;

-- One row of reminder bookkeeping each, and the uniqueness is the point rather
-- than housekeeping: both columns are read as "the" value for a person, so a
-- second row would not announce itself as a collision -- the absent-today gate
-- and the per-episode dedupe would simply start answering from whichever row the
-- query reached first.
CREATE UNIQUE INDEX idx_reminder_state_user ON reminder_state (user_id);

UPDATE push_subscription
   SET user_id = (SELECT id FROM user)
 WHERE user_id IS NULL
   AND (SELECT count(*) FROM user) = 1;

-- Rebuilt for NOT NULL alone, and note what is deliberately *not* widened:
-- endpoint stays globally unique. A Web Push endpoint is issued by the browser
-- and is globally unique by nature, so two rows carrying one are two claims on
-- the same device rather than two devices. If two Users ever share a browser
-- profile, re-subscribing therefore *reassigns* that device to whoever opted in
-- last -- which is the behaviour the notification should follow (ADR 0021).
--
-- AUTOINCREMENT is carried over rather than preserved, and the difference is
-- worth stating because a rebuild cannot keep what it is for. DROP TABLE takes
-- the sqlite_sequence row with it, and the copy re-seeds the counter from max(id)
-- among the rows that *survive* -- so an id belonging to a device unsubscribed
-- before this migration becomes mintable again. Nothing turns on that: no foreign
-- key targets this id, no endpoint exposes it, and its only use in main sources is
-- an ORDER BY. What remains is "unique among live rows", which is all the
-- application ever asked of it. V11 did the same to its three tables.
CREATE TABLE push_subscription_new (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint    TEXT    NOT NULL UNIQUE,
    p256dh      TEXT    NOT NULL,
    auth        TEXT    NOT NULL,
    label       TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    user_id     INTEGER NOT NULL REFERENCES user (id)
);

INSERT INTO push_subscription_new (id, endpoint, p256dh, auth, label, created_at, user_id)
SELECT id, endpoint, p256dh, auth, label, created_at, user_id FROM push_subscription;

DROP TABLE push_subscription;

ALTER TABLE push_subscription_new RENAME TO push_subscription;
