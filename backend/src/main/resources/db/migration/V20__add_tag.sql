-- F18 (ADR 0033): a Tag is a thing a User keeps, not a word repeated on each Food.
-- It outlives the last Food carrying it, so it needs a table of its own.
--
-- Additive only -- no existing table is rebuilt, so this runs inside Flyway's
-- transaction with foreign keys enforced like any other migration (ADR 0021).
--
-- The name is unique per User ignoring case: "Breakfast" typed against an existing
-- "breakfast" is the Tag that exists, and that is a database fact rather than a UI
-- convention. NOCASE folds ASCII only, so the domain's TagName -- which folds the
-- whole of Unicode -- is what resolves an accented name to the Tag it already is,
-- and this index is the backstop behind it.
CREATE TABLE tag (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES user (id),
    name       TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_tag_user_name ON tag (user_id, name COLLATE NOCASE);

-- Which Tags a Food wears. Owned through both ends, the way recipe_ingredient is
-- owned through its Recipe (ADR 0021): no user_id of its own to keep in agreement.
-- Deleting either side takes the link with it and never the other side -- a Food
-- deleted keeps its Tags in the catalog, and a Tag deleted keeps every Food.
CREATE TABLE food_tag (
    food_id INTEGER NOT NULL REFERENCES food (id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tag (id) ON DELETE CASCADE,
    PRIMARY KEY (food_id, tag_id)
);

-- The primary key serves a lookup by Food. This serves one by Tag -- a Tag's
-- count of Foods, and deleting a Tag, which has to find every link it cascades to.
CREATE INDEX idx_food_tag_tag ON food_tag (tag_id);
