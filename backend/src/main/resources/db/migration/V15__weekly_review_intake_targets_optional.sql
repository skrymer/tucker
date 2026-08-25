-- F12 slice 3 (issue #249): a Weekly Review has two jobs, and only the second is
-- optional. Every review records the Trend Weight. A review run with Calorie
-- Tracking off carries no Maintenance, no Calorie Budget and no Protein Floor,
-- because a Budget derived from an empty log is one the adaptive correction can
-- never bring back to the truth (ADR 0024).
--
-- SQLite cannot relax a column to nullable, so this is a table rebuild. Nothing
-- references weekly_review (it only points at user), so by ADR 0021's rule --
-- "can everything that references it be rebuilt alongside it?" -- this is the
-- ordinary case: inside Flyway's transaction, foreign keys enforced throughout,
-- no executeInTransaction=false and no PRAGMA foreign_keys = OFF.
--
-- The four columns are relaxed **together**, under a table-level CHECK, because
-- they are one value object (IntakeTargets) and not four independent fields. Four
-- separate nullables would admit rows the domain has no meaning for -- a Floor
-- with no Budget, a Budget with no basis -- and leave every reader re-establishing
-- that they agree. The CHECK is the schema saying what the value object says.
--
-- maintenance_basis loses V7's DEFAULT 'FORMULA_SEED'. That default existed to
-- keep the rows V7 backfilled valid, and it is now actively wrong: an INSERT that
-- omits all four columns would be given a basis and nothing to be the basis of,
-- which the CHECK would then refuse for a reason nobody could read.
--
-- No row is rewritten. Every existing review was written by an engine that always
-- produced targets, so all four values carry across intact and every one of them
-- stays non-null. WeeklyReviewIntakeTargetsMigrationTest asserts exactly that
-- rather than trusting this comment.
CREATE TABLE weekly_review_new (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewed_on          TEXT    NOT NULL,
    trend_weight_kg      REAL    NOT NULL,
    maintenance_kcal     REAL,
    calorie_budget_kcal  REAL,
    protein_floor_g      REAL,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now')),
    maintenance_basis    TEXT,
    user_id              INTEGER NOT NULL REFERENCES user (id),
    CHECK (
        (maintenance_kcal IS NULL AND maintenance_basis IS NULL
            AND calorie_budget_kcal IS NULL AND protein_floor_g IS NULL)
        OR (maintenance_kcal IS NOT NULL AND maintenance_basis IS NOT NULL
            AND calorie_budget_kcal IS NOT NULL AND protein_floor_g IS NOT NULL)
    )
);

INSERT INTO weekly_review_new (id, reviewed_on, trend_weight_kg, maintenance_kcal,
                               calorie_budget_kcal, protein_floor_g, created_at,
                               maintenance_basis, user_id)
SELECT id, reviewed_on, trend_weight_kg, maintenance_kcal,
       calorie_budget_kcal, protein_floor_g, created_at,
       maintenance_basis, user_id FROM weekly_review;

DROP TABLE weekly_review;

ALTER TABLE weekly_review_new RENAME TO weekly_review;

-- Recreated with the table it indexes: one review per date per person, the rule
-- V11 made per-User and a rebuild drops along with the table it belonged to.
CREATE UNIQUE INDEX idx_weekly_review_user_day
    ON weekly_review (user_id, reviewed_on);
