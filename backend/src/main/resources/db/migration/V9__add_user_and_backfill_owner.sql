-- F10 slice 2 (issue #156): Tucker gains a User, and everything already in the
-- database becomes the owner's. See ADR 0020 (where identity comes from) and
-- ADR 0021 (every row is owned by exactly one User).
--
-- Nothing is scoped yet. Queries still ignore user_id, which is safe because
-- production holds exactly one User until the second is invited (issue #161) --
-- an unscoped read cannot leak anything before then. This migration is only the
-- schema and the adoption of the existing rows.

-- The surrogate key is the whole point (ADR 0020): every owned table references
-- user.id, and the email is a mutable attribute matched at request time. Going
-- public later means adding credentials on the *same* row rather than re-keying
-- the database.
--
-- COLLATE NOCASE because just-in-time provisioning looks a User up by the email
-- Cloudflare asserts. With SQLite's default (case-sensitive) collation, an
-- assertion for Owner@example.com and one for owner@example.com are two
-- different Users -- the second silently provisions a fresh one and the
-- first one's entire history becomes invisible. The application also lowercases
-- before writing, so the stored form is stable, but the collation is what makes
-- the *uniqueness* hold rather than merely the convention.
CREATE TABLE user (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Adopt the existing database, if there is one to adopt.
--
-- ${ownerEmail} is a Flyway placeholder with **no default anywhere**, matching
-- the tucker.access.* precedent from slice 1: a value that must be right and
-- cannot be guessed is better as a boot failure than as a wrong default. Get it
-- wrong and the owner's next sign-in provisions a *second* User, leaving years
-- of Entries, Weight Measurements, Goals and Weekly Reviews owned by a row
-- nobody authenticates as. Production supplies TUCKER_OWNER_EMAIL (see
-- deploy/README.md) and every non-production boot path states its own.
--
-- The row is inserted only when there is data to attribute. On an empty
-- database -- every test, every smoke run, every fresh deploy -- there is
-- nothing to adopt, so no owner is seeded and the first person to open Tucker
-- becomes User 1 through the ordinary just-in-time path. That keeps provisioning
-- the single way a User comes into being (ADR 0020) instead of leaving a
-- phantom owner that owns nothing in every non-production database.
INSERT INTO user (id, email)
SELECT 1, '${ownerEmail}'
WHERE EXISTS (SELECT 1 FROM food)
   OR EXISTS (SELECT 1 FROM entry)
   OR EXISTS (SELECT 1 FROM weight_measurement)
   OR EXISTS (SELECT 1 FROM goal)
   OR EXISTS (SELECT 1 FROM weekly_review)
   OR EXISTS (SELECT 1 FROM profile)
   OR EXISTS (SELECT 1 FROM push_subscription)
   OR EXISTS (SELECT 1 FROM reminder_state);

-- Every owned table gains an owner, and every existing row becomes User 1's.
--
-- The column is **nullable**, which is not the shape anyone would choose. SQLite
-- refuses to add a NOT NULL column that also carries a REFERENCES clause to a
-- table that already has rows -- "Cannot add a REFERENCES column with non-NULL
-- default value" -- and it refuses it *only then*. On an empty table the same
-- statement succeeds, so a NOT NULL version of this migration would pass every
-- test, every smoke and the jOOQ codegen schema, and fail against exactly one
-- database in the world: the production one holding the data this migration
-- exists to preserve.
--
-- The alternative that buys NOT NULL is rebuilding all eight tables, which needs
-- executeInTransaction=false (so a failure part-way leaves production
-- half-migrated with no rollback) and PRAGMA foreign_keys = OFF -- which, with
-- maximum-pool-size 1, is handed back to the pool and disables referential
-- integrity process-wide for the life of the JVM. Two silent hazards against
-- real data, to buy a constraint the domain already maintains.
--
-- So the foreign key lands now and NOT NULL waits. It costs little: from the
-- scoping slices on, an unowned row is invisible to the very User who created
-- it, which fails loudly the first time anyone looks. The tables that ADR 0021
-- rebuilds anyway for per-user uniqueness (profile loses CHECK (id = 1),
-- weight_measurement and weekly_review lose their global UNIQUE) can tighten it
-- for free while they are being rewritten.
--
-- recipe_ingredient is deliberately absent. A Recipe *is* a Food row, so its
-- ingredient lines are owned through it -- they cascade away with it and every
-- query already reaches them through a Food (RecipeRepository joins FOOD to
-- resolve them). A user_id here would be a second copy of a fact that nothing
-- keeps in agreement with food.user_id. app_config is likewise absent -- the
-- VAPID keypair is Tucker's, not a User's.
ALTER TABLE food              ADD COLUMN user_id INTEGER REFERENCES user (id);
ALTER TABLE entry             ADD COLUMN user_id INTEGER REFERENCES user (id);
ALTER TABLE weight_measurement ADD COLUMN user_id INTEGER REFERENCES user (id);
ALTER TABLE goal              ADD COLUMN user_id INTEGER REFERENCES user (id);
ALTER TABLE weekly_review     ADD COLUMN user_id INTEGER REFERENCES user (id);
ALTER TABLE profile           ADD COLUMN user_id INTEGER REFERENCES user (id);
ALTER TABLE push_subscription ADD COLUMN user_id INTEGER REFERENCES user (id);
ALTER TABLE reminder_state    ADD COLUMN user_id INTEGER REFERENCES user (id);

UPDATE food              SET user_id = 1;
UPDATE entry             SET user_id = 1;
UPDATE weight_measurement SET user_id = 1;
UPDATE goal              SET user_id = 1;
UPDATE weekly_review     SET user_id = 1;
UPDATE profile           SET user_id = 1;
UPDATE push_subscription SET user_id = 1;
UPDATE reminder_state    SET user_id = 1;
