-- F10 slice 4 (issue #158): the body and the plan become private. The unique
-- constraints that encoded "one person uses this app" become per User, and
-- user_id becomes NOT NULL on the three tables this slice scopes. See ADR 0021.
--
-- These are table rebuilds because measured_on's and reviewed_on's UNIQUE are
-- *column* constraints, whose backing sqlite_autoindex cannot be dropped. V9
-- deferred user_id's NOT NULL to exactly these rebuilds.
--
-- V9 priced a rebuild at executeInTransaction=false plus PRAGMA foreign_keys =
-- OFF. Neither is needed for these three, because nothing *references* them --
-- see ADR 0021, "What a rebuild actually costs", which now records the rule and
-- which tables it covers. So foreign keys stay enforced throughout and this
-- migration runs inside Flyway's transaction like every other: there is no
-- half-migrated state to fear. PerUserUniquenessMigrationTest asserts the
-- premise rather than trusting this comment.
--
-- POLICY FOR ALL THREE ADOPTIONS BELOW. A row with no owner was written between
-- V9 (which added user_id, nullable) and here, by an app that had not yet learned
-- to stamp one.
--
-- These rows are **adopted, never discarded**, and the distinction matters more
-- here than it does for food or entry. Those two were scoped in slice 3, so an
-- unowned one really is invisible to everybody and dropping it loses nothing.
-- These three are scoped by *this* slice -- until it runs, the repositories
-- reading them have no owner predicate at all, so an unowned reading, Goal or
-- Weekly Review is fully visible and is actively setting somebody's Trend Weight,
-- Calorie Budget and Goal banner. Deleting them would destroy live data: every
-- reading recorded since the previous deploy, the active Goal (dropping its owner into
-- Maintenance Mode with none of the insistent fork ADR 0008 requires), and
-- Weekly Reviews, which this project treats as irreversible history.
--
-- Adoption is guarded on there being exactly one User, which is every database
-- that can hold an unowned row: the second User is not invited until issue #161,
-- long after this migration. With none or several, attribution would be a guess,
-- so nothing is adopted and the NOT NULL on the rebuild below refuses the
-- migration -- a boot failure a human resolves, inside a transaction that rolls
-- back cleanly, rather than a silent deletion nobody can undo.
UPDATE weight_measurement
   SET user_id = (SELECT id FROM user)
 WHERE user_id IS NULL
   AND (SELECT count(*) FROM user) = 1;

-- Rebuilt to say what it now means: measured_on is unique *within* a User, and
-- every reading belongs to one. Column order matches the table it replaces
-- (user_id last, where V9's ALTER put it) so the generated jOOQ records are
-- unchanged apart from the constraint.
CREATE TABLE weight_measurement_new (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    measured_on  TEXT    NOT NULL,
    weight_kg    REAL    NOT NULL CHECK (weight_kg > 0),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    user_id      INTEGER NOT NULL REFERENCES user (id)
);

INSERT INTO weight_measurement_new (id, measured_on, weight_kg, created_at, user_id)
SELECT id, measured_on, weight_kg, created_at, user_id FROM weight_measurement;

DROP TABLE weight_measurement;

ALTER TABLE weight_measurement_new RENAME TO weight_measurement;

-- One reading per day per person -- the rule the domain always stated, now
-- said in the schema for more than one person. Two Users weighing on the same
-- morning are two readings, which the global constraint made impossible.
CREATE UNIQUE INDEX idx_weight_measurement_user_day
    ON weight_measurement (user_id, measured_on);

UPDATE goal
   SET user_id = (SELECT id FROM user)
 WHERE user_id IS NULL
   AND (SELECT count(*) FROM user) = 1;

-- goal's single-active rule lives in a *named* partial index, so this table
-- alone could have been widened by an index swap. It is rebuilt anyway, for
-- NOT NULL: the mechanics are the ones two lines up, the migration has already
-- paid for the pattern, and leaving one of the three tables this slice scopes
-- with a nullable owner would be a difference with no reason behind it.
CREATE TABLE goal_new (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    started_on        TEXT    NOT NULL,
    start_weight_kg   REAL    NOT NULL CHECK (start_weight_kg > 0),
    target_weight_kg  REAL    NOT NULL CHECK (target_weight_kg > 0),
    rate_kg_per_week  REAL    NOT NULL CHECK (rate_kg_per_week > 0),
    active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    reached_on        TEXT,
    user_id           INTEGER NOT NULL REFERENCES user (id)
);

INSERT INTO goal_new (id, started_on, start_weight_kg, target_weight_kg,
                      rate_kg_per_week, active, created_at, reached_on, user_id)
SELECT id, started_on, start_weight_kg, target_weight_kg,
       rate_kg_per_week, active, created_at, reached_on, user_id FROM goal;

DROP TABLE goal;

ALTER TABLE goal_new RENAME TO goal;

-- At most one active Goal *each*. Held globally, one person starting a Goal
-- would either collide with another's or -- worse, and what actually happened --
-- deactivate it, dropping them into Maintenance Mode having decided nothing.
CREATE UNIQUE INDEX idx_goal_user_single_active
    ON goal (user_id, active) WHERE active = 1;

UPDATE weekly_review
   SET user_id = (SELECT id FROM user)
 WHERE user_id IS NULL
   AND (SELECT count(*) FROM user) = 1;

-- Column order and defaults are V1's as V7 left them (note dropped,
-- maintenance_basis appended), so the only thing that changes about a review is
-- who it is about.
CREATE TABLE weekly_review_new (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewed_on          TEXT    NOT NULL,
    trend_weight_kg      REAL    NOT NULL,
    maintenance_kcal     REAL    NOT NULL,
    calorie_budget_kcal  REAL    NOT NULL,
    protein_floor_g      REAL    NOT NULL,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
    maintenance_basis    TEXT    NOT NULL DEFAULT 'FORMULA_SEED',
    user_id              INTEGER NOT NULL REFERENCES user (id)
);

INSERT INTO weekly_review_new (id, reviewed_on, trend_weight_kg, maintenance_kcal,
                               calorie_budget_kcal, protein_floor_g, created_at,
                               maintenance_basis, user_id)
SELECT id, reviewed_on, trend_weight_kg, maintenance_kcal,
       calorie_budget_kcal, protein_floor_g, created_at,
       maintenance_basis, user_id FROM weekly_review;

DROP TABLE weekly_review;

ALTER TABLE weekly_review_new RENAME TO weekly_review;

-- One review per date per person. The engine treats a review as idempotent *by
-- date*, so a global constraint here never announced itself as a collision --
-- it quietly handed the second person the first person's Budget instead.
CREATE UNIQUE INDEX idx_weekly_review_user_day
    ON weekly_review (user_id, reviewed_on);
