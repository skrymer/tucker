-- Tucker initial schema. Realises the domain model in /CONTEXT.md.
-- SQLite: dates are ISO-8601 TEXT, mass/nutrition are REAL.

-- Single-row profile: body stats for the Mifflin-St Jeor maintenance seed.
CREATE TABLE profile (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    sex         TEXT    NOT NULL CHECK (sex IN ('MALE', 'FEMALE')),
    birth_date  TEXT    NOT NULL,
    height_cm   REAL    NOT NULL CHECK (height_cm > 0)
);

-- A Food: a reusable per-100g definition. A Recipe is a Food with kind = 'RECIPE'.
CREATE TABLE food (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT    NOT NULL,
    kind               TEXT    NOT NULL DEFAULT 'FOOD' CHECK (kind IN ('FOOD', 'RECIPE')),
    barcode            TEXT,                       -- set when created via barcode scan
    calories_per_100g  REAL    NOT NULL CHECK (calories_per_100g >= 0),
    protein_per_100g   REAL    NOT NULL CHECK (protein_per_100g >= 0),
    carbs_per_100g     REAL,                       -- stored when available, not targeted
    fat_per_100g       REAL,                       -- stored when available, not targeted
    cooked_weight_g    REAL,                       -- RECIPE only: finished-dish weight
    created_at         TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_food_kind ON food (kind);
CREATE UNIQUE INDEX idx_food_barcode ON food (barcode) WHERE barcode IS NOT NULL;

-- An ingredient line of a Recipe: an ingredient Food weighed into the Recipe.
CREATE TABLE recipe_ingredient (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id          INTEGER NOT NULL REFERENCES food (id) ON DELETE CASCADE,
    ingredient_food_id INTEGER NOT NULL REFERENCES food (id),
    grams              REAL    NOT NULL CHECK (grams > 0)
);
CREATE INDEX idx_recipe_ingredient_recipe ON recipe_ingredient (recipe_id);

-- An Entry: one eating occasion.
--  WEIGHED   -> references a Food + grams.
--  ESTIMATED -> carries its own label + calories, no Food (restaurants, on the go).
CREATE TABLE entry (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    logged_on   TEXT    NOT NULL,                  -- ISO-8601 date
    kind        TEXT    NOT NULL CHECK (kind IN ('WEIGHED', 'ESTIMATED')),
    food_id     INTEGER REFERENCES food (id),      -- WEIGHED only
    grams       REAL    CHECK (grams IS NULL OR grams > 0),
    label       TEXT,                              -- ESTIMATED only: free-text name
    calories    REAL    NOT NULL CHECK (calories >= 0),   -- snapshot at log time
    protein     REAL    CHECK (protein IS NULL OR protein >= 0),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    CHECK ((kind = 'WEIGHED'   AND food_id IS NOT NULL AND grams IS NOT NULL)
        OR (kind = 'ESTIMATED' AND food_id IS NULL     AND grams IS NULL AND label IS NOT NULL))
);
CREATE INDEX idx_entry_logged_on ON entry (logged_on);

-- A Weight Measurement: a dated body-weight reading (one per day).
CREATE TABLE weight_measurement (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    measured_on  TEXT    NOT NULL UNIQUE,
    weight_kg    REAL    NOT NULL CHECK (weight_kg > 0),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- A Goal: a target weight + rate of loss. At most one active Goal at a time.
CREATE TABLE goal (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    started_on        TEXT    NOT NULL,
    start_weight_kg   REAL    NOT NULL CHECK (start_weight_kg > 0),
    target_weight_kg  REAL    NOT NULL CHECK (target_weight_kg > 0),
    rate_kg_per_week  REAL    NOT NULL CHECK (rate_kg_per_week > 0),
    active            INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_goal_single_active ON goal (active) WHERE active = 1;

-- A Weekly Review: one weekly recomputation of the adaptive engine.
CREATE TABLE weekly_review (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    reviewed_on          TEXT    NOT NULL UNIQUE,
    trend_weight_kg      REAL    NOT NULL,
    maintenance_kcal     REAL    NOT NULL,
    calorie_budget_kcal  REAL    NOT NULL,
    protein_floor_g      REAL    NOT NULL,
    note                 TEXT,
    created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
