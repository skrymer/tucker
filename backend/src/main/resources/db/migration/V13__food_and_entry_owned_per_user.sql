-- Issue #232: food.user_id and entry.user_id become NOT NULL, the last of
-- ADR 0021's ownership left to the repositories alone. SQLite cannot add NOT NULL
-- to an existing column, so closing it means rebuilding both.
--
-- These are table rebuilds, and food is the one *rebuilt* table that other tables
-- reference -- so ADR 0021 priced this one at executeInTransaction=false
-- plus PRAGMA foreign_keys = OFF. It does not need either. Dropping food's children
-- first leaves it a parent of nothing, which is the condition ADR 0021 states the
-- rule as ("does anything reference this table?"), so foreign keys stay enforced
-- throughout and this runs inside Flyway's transaction like every other migration:
-- there is no half-migrated state to fear and no process-wide PRAGMA. See ADR 0021,
-- "What a rebuild actually costs". PerUserUniquenessMigrationTest asserts the
-- premise -- which tables reference which -- rather than trusting this comment.
--
-- The price is that recipe_ingredient is rewritten though it gains nothing. Its
-- definition below is V1's unchanged, and FoodAndEntryOwnershipMigrationTest reads
-- every column of it back, because a table rebuilt for another table's benefit is
-- the one nobody thinks to check.
--
-- ADOPTION, AS EVERY REBUILD BEFORE THIS ONE, and on the same guard: a row with no
-- owner is adopted when there is exactly one User to adopt it, and otherwise the
-- NOT NULL below refuses the migration rather than let it guess (ADR 0021).
--
-- What differs is why deletion is out of the question. V11 and V12 could not delete
-- because the slice doing the rebuild was the slice doing the scoping, so the row
-- was still live. That argument has expired here -- food and entry were scoped in
-- slice 3, so an unowned one has been invisible to its own author ever since. The
-- one that replaces it is blunter: an unowned Food may still be *referenced*. Both
-- edges into it refuse a delete -- entry.food_id and recipe_ingredient
-- .ingredient_food_id are NO ACTION -- so here deleting is not merely wasteful, it
-- is refused. And in the shape this migration actually takes, where "deleting" means
-- leaving the row out of the copy, the children fail to re-insert against a food
-- that no longer has it. Either way the migration stops rather than losing a row.
UPDATE food
   SET user_id = (SELECT id FROM user)
 WHERE user_id IS NULL
   AND (SELECT count(*) FROM user) = 1;

UPDATE entry
   SET user_id = (SELECT id FROM user)
 WHERE user_id IS NULL
   AND (SELECT count(*) FROM user) = 1;

-- Park food's two children. CREATE TABLE AS SELECT is deliberate: it carries no
-- constraints, no foreign keys and no indexes -- exactly what a holding table
-- wants -- and SELECT * cannot drop a column the way a hand-written list can.
-- The declared types come across with it, so a TEXT column holding something
-- that looks numeric (an Entry labelled '007', say) keeps its leading zeros
-- rather than arriving back as a number.
CREATE TABLE entry_parked AS SELECT * FROM entry;

CREATE TABLE recipe_ingredient_parked AS SELECT * FROM recipe_ingredient;

-- Safe in either order and against either table: nothing in the schema
-- references entry or recipe_ingredient, so neither drop strands a row or fires
-- an action. This is the step that buys the transaction.
--
-- All five drops in this file are row-by-row rather than O(1) -- with foreign
-- keys on, DROP TABLE runs an implicit DELETE FROM first -- and dropping these
-- three also takes their sqlite_sequence rows, so AUTOINCREMENT re-seeds from
-- max(id) among the rows copied back. V11 and V12 did the same to their tables.
-- It means a deleted row's id can be minted again, which food and entry expose
-- on their endpoints where push_subscription did not: a client holding a stale
-- list could delete a *different* row of the same id. Small, single-user, and
-- not corruption -- but no longer the non-issue V12 could call it.
DROP TABLE entry;

DROP TABLE recipe_ingredient;

-- Column order is V1's as V9 left it (user_id last, where the ALTER put it), so
-- the generated jOOQ records are unchanged apart from the constraint.
CREATE TABLE food_new (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    kind               TEXT    NOT NULL DEFAULT 'FOOD' CHECK (kind IN ('FOOD', 'RECIPE')),
    barcode            TEXT,
    calories_per_100g  REAL    NOT NULL CHECK (calories_per_100g >= 0),
    protein_per_100g   REAL    NOT NULL CHECK (protein_per_100g >= 0),
    carbs_per_100g     REAL,
    fat_per_100g       REAL,
    cooked_weight_g    REAL,
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    user_id            INTEGER NOT NULL REFERENCES user (id)
);

INSERT INTO food_new (id, name, kind, barcode, calories_per_100g, protein_per_100g,
                      carbs_per_100g, fat_per_100g, cooked_weight_g, created_at,
                      updated_at, user_id)
SELECT id, name, kind, barcode, calories_per_100g, protein_per_100g,
       carbs_per_100g, fat_per_100g, cooked_weight_g, created_at,
       updated_at, user_id FROM food;

DROP TABLE food;

ALTER TABLE food_new RENAME TO food;

CREATE INDEX idx_food_kind ON food (kind);

-- V10's index, restored unchanged: a barcode is unique per User, and partial
-- because a Food may have none at all (hand-entered, or a Recipe).
CREATE UNIQUE INDEX idx_food_user_barcode
    ON food (user_id, barcode) WHERE barcode IS NOT NULL;

-- The children come back referencing the rebuilt food by its final name, so
-- nothing here depends on whether ALTER TABLE ... RENAME rewrites the foreign
-- keys of other tables. With foreign keys enforced, these inserts also re-prove
-- every food_id and recipe_id against the table that was just rewritten.
CREATE TABLE entry (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    logged_on   TEXT    NOT NULL,
    kind        TEXT    NOT NULL CHECK (kind IN ('WEIGHED', 'ESTIMATED')),
    food_id     INTEGER REFERENCES food (id),
    grams       REAL    CHECK (grams IS NULL OR grams > 0),
    label       TEXT,
    calories    REAL    NOT NULL CHECK (calories >= 0),
    protein     REAL    CHECK (protein IS NULL OR protein >= 0),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    user_id     INTEGER NOT NULL REFERENCES user (id),
    CHECK ((kind = 'WEIGHED'   AND food_id IS NOT NULL AND grams IS NOT NULL)
        OR (kind = 'ESTIMATED' AND food_id IS NULL     AND grams IS NULL AND label IS NOT NULL))
);

INSERT INTO entry (id, logged_on, kind, food_id, grams, label, calories, protein,
                   created_at, user_id)
SELECT id, logged_on, kind, food_id, grams, label, calories, protein,
       created_at, user_id FROM entry_parked;

CREATE INDEX idx_entry_logged_on ON entry (logged_on);

-- V1's definition, unchanged. recipe_ingredient carries no owner of its own: a
-- Recipe is a Food row, so its ingredient lines are owned through it, cascade
-- away with it, and are reached through a Food by every query (ADR 0021). A
-- user_id here would be a second copy of a fact nothing keeps in agreement.
CREATE TABLE recipe_ingredient (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id          INTEGER NOT NULL REFERENCES food (id) ON DELETE CASCADE,
    ingredient_food_id INTEGER NOT NULL REFERENCES food (id),
    grams              REAL    NOT NULL CHECK (grams > 0)
);

INSERT INTO recipe_ingredient (id, recipe_id, ingredient_food_id, grams)
SELECT id, recipe_id, ingredient_food_id, grams FROM recipe_ingredient_parked;

CREATE INDEX idx_recipe_ingredient_recipe ON recipe_ingredient (recipe_id);

DROP TABLE entry_parked;

DROP TABLE recipe_ingredient_parked;
