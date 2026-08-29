-- F15 slice 1 (issue #278): a Food may be matched to a Reference Food and then
-- borrows its micronutrient profile (ADR 0027). Three things make that possible:
-- the link, the search index a User finds a candidate through, and the synonyms
-- that turn Australian retail vernacular into the words FSANZ writes.

-- The owned side of the borrow. Nullable, because a Food starts unmatched and
-- most stay that way -- coverage is structurally poor and Tucker states the
-- share rather than pretending otherwise. It is scoped through its Food and so
-- carries no user_id of its own (ADR 0021), and it points at a global row every
-- User shares, which is the whole point of a link over a copy.
ALTER TABLE food ADD COLUMN reference_food_id INTEGER REFERENCES reference_food (id);

-- The search index, and the single biggest thing standing between a User and a
-- match. Three settings, each measured in a design spike that took a realistic
-- query set from 5 of 15 to 16 of 19 top-1 (ADR 0027):
--
--  * `head` and `rest` are separate columns. An AFCD name reads
--    `Head, qualifier, qualifier, state`, so the head IS the food, and ranking
--    it ten times heavier than the qualifiers is what stops `Free-range eggs`
--    returning `Bread, gluten free` on the word *free*. The weights live with
--    the query, in ReferenceFoodRepository.
--  * `porter` stemming, without which `Almonds` matches nothing at all.
--  * `unicode61`, so the diacritics FSANZ uses fold away.
--
-- The split is an indexing concern rather than a property of a food, so it
-- lives here and not as two more columns on reference_food.
CREATE VIRTUAL TABLE reference_food_fts USING fts5(
    head,
    rest,
    tokenize = 'porter unicode61'
);

-- Populated from the table rather than from the generator, so the rule that
-- defines the split is written once. `rowid` is the reference_food id, which is
-- what lets a hit be resolved back to the food it names.
INSERT INTO reference_food_fts (rowid, head, rest)
SELECT id,
       CASE WHEN instr(name, ',') > 0
            THEN substr(name, 1, instr(name, ',') - 1)
            ELSE name END,
       CASE WHEN instr(name, ',') > 0
            THEN substr(name, instr(name, ',') + 1)
            ELSE '' END
FROM reference_food;

-- The vernacular rewrite, applied to a User's words before they reach FTS5.
-- The failures it fixes are systematic rather than random: AFCD writes
-- `Cheese, cheddar` and `Yoghurt, natural` where a shopper writes *tasty* and
-- *Greek*, and no amount of ranking recovers a word the corpus does not contain.
--
-- A term may rewrite to nothing, which is how `free range` -- a phrase that
-- describes farming rather than food -- stops competing for matches.
--
-- Grown ONLY on observed failure. A curated list is real ongoing debt and one
-- that grows speculatively grows without bound, so a new row here belongs with
-- the query that failed and a test that pins it.
CREATE TABLE reference_food_synonym (
    term        TEXT PRIMARY KEY,
    replacement TEXT NOT NULL
);

-- The eleven rewrites the spike measured, and only those: this list is grown on an
-- observed failure and never speculatively, because one that grows speculatively
-- grows without bound (ADR 0027).
INSERT INTO reference_food_synonym (term, replacement) VALUES
    ('tasty', 'cheddar'),
    ('greek', 'natural'),
    ('full cream', 'regular fat'),
    ('jasmine', 'white'),
    ('basmati', 'white'),
    ('tinned', 'canned'),
    ('free range', ''),
    ('lite', 'reduced fat'),
    ('chook', 'chicken'),
    ('roo', 'kangaroo'),
    ('avo', 'avocado');
