-- The last id handed out per table, so a repository can give an aggregate its
-- identity before it is built (ADR 0036). Every table keeps its INTEGER PRIMARY
-- KEY, which accepts the explicit id the insert now writes. Each sequence starts
-- past every id its table has ever handed out, not only the highest one still
-- stored: AUTOINCREMENT never reissued a deleted row's id, and neither may this.
CREATE TABLE id_sequence (
    name    TEXT PRIMARY KEY,
    last_id INTEGER NOT NULL
);

INSERT INTO id_sequence (name, last_id)
SELECT 'entry', MAX(COALESCE(MAX(id), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'entry'), 0)) FROM entry
UNION ALL SELECT 'food', MAX(COALESCE(MAX(id), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'food'), 0)) FROM food
UNION ALL SELECT 'goal', MAX(COALESCE(MAX(id), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'goal'), 0)) FROM goal
UNION ALL SELECT 'tag', MAX(COALESCE(MAX(id), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'tag'), 0)) FROM tag
UNION ALL SELECT 'user', MAX(COALESCE(MAX(id), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'user'), 0)) FROM user
UNION ALL SELECT 'weekly_review', MAX(COALESCE(MAX(id), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'weekly_review'), 0)) FROM weekly_review
UNION ALL SELECT 'weight_measurement', MAX(COALESCE(MAX(id), 0), COALESCE((SELECT seq FROM sqlite_sequence WHERE name = 'weight_measurement'), 0)) FROM weight_measurement;
