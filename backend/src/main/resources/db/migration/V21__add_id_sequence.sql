-- The last id handed out per table, so a repository can give an aggregate its
-- identity before it is built (ADR 0036). Every table keeps its INTEGER PRIMARY
-- KEY, which accepts the explicit id the insert now writes. Each sequence starts
-- at its table's highest id, or the first one handed out would collide.
CREATE TABLE id_sequence (
    name    TEXT PRIMARY KEY,
    last_id INTEGER NOT NULL
);

INSERT INTO id_sequence (name, last_id)
SELECT 'entry', COALESCE(MAX(id), 0) FROM entry
UNION ALL SELECT 'food', COALESCE(MAX(id), 0) FROM food
UNION ALL SELECT 'goal', COALESCE(MAX(id), 0) FROM goal
UNION ALL SELECT 'tag', COALESCE(MAX(id), 0) FROM tag
UNION ALL SELECT 'user', COALESCE(MAX(id), 0) FROM user
UNION ALL SELECT 'weekly_review', COALESCE(MAX(id), 0) FROM weekly_review
UNION ALL SELECT 'weight_measurement', COALESCE(MAX(id), 0) FROM weight_measurement;
