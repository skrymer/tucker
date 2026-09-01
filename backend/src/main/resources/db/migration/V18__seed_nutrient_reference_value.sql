-- F15 slice 2 (issue #279): the Nutrient Reference Values for Australia and New
-- Zealand (NHMRC, 2006, sodium revised 2017) as the lines a Micronutrient Intake
-- is read against (ADR 0027).
--
-- Global and unowned, like `reference_food` and `app_config` -- a published
-- figure describes a body of a given age and sex, not one person (ADR 0021).
-- Every User is in Australia, so there is one set and no per-jurisdiction
-- resolution.
--
-- READ LIVE, never snapshotted. A Calorie Budget from a past week is a
-- commitment the User was held to and is preserved as it was, while a Reference
-- Intake is a measuring stick for a body NOW -- if the published figure was
-- revised, the old reading was simply wrong. A revision therefore ships as a NEW
-- migration and a pull request, never a scheduled download: a few hundred rows
-- that move twice a career do not earn refresh infrastructure, and a silent
-- overnight change to what Tucker says about somebody's iron should be read by a
-- human first.
--
-- A band is IN FORCE FROM its `from_age` until the next one opens, so resolution
-- is the newest band a body has passed. The bands are the ones NHMRC publishes
-- and are therefore ragged: sodium's are 14 and 18 where every other nutrient's
-- are 14, 19, 31, 51 and 71.
--
-- Seeded from 14, which is NHMRC's own adolescent band and below any plausible
-- User of a weight-loss tracker. Below it nothing resolves, and a nutrient with
-- no Reference Intake earns no claim rather than being read against an adult
-- line that is not its own.
--
-- Pregnancy and lactation shift several of these substantially (iron 18->27 mg,
-- folate 400->600 ug) and Tucker has no field for either, so those bands are not
-- seeded and the assumption is stated where the figures are read.
--
-- WHERE A LINE IS ABSENT IT IS ABSENT ON PURPOSE, and the per-nutrient comments
-- below say why. Three of them (vitamin A, niacin, folate) publish an Upper
-- Level for a DIFFERENT SUBSTANCE than AFCD reports, and one (magnesium)
-- publishes one for supplements alone. An over-the-limit claim is the one Tucker
-- makes at any coverage, so a wrong line there is worse than none.
--
-- Source: https://www.nhmrc.gov.au/about-us/publications/nutrient-reference-values-australia-and-new-zealand-including-recommended-dietary-intakes
-- Licence: CC BY 4.0, attributed `Source: National Health and Medical Research
-- Council` wherever the figures are read -- see ReferenceFoodAttribution.

CREATE TABLE nutrient_reference_value (
    nutrient     TEXT NOT NULL,
    sex          TEXT NOT NULL,
    -- The age in whole years this band opens at. It closes where the next opens.
    from_age     INTEGER NOT NULL,
    -- The RDI, or the AI where no RDI is set -- the line to reach. Null only for
    -- sodium, whose published figure is a range rather than a line.
    recommended  REAL,
    -- The line not to cross, and which published figure it is. Null wherever
    -- NHMRC publishes none that can be read against food eaten.
    limit_amount REAL,
    limit_kind   TEXT,
    PRIMARY KEY (nutrient, sex, from_age),
    CHECK (sex IN ('MALE', 'FEMALE')),
    CHECK (from_age >= 0),
    CHECK (recommended IS NULL OR recommended > 0),
    CHECK (limit_amount IS NULL OR limit_amount > 0),
    -- An amount with no kind would be a figure nothing can name, and a kind with
    -- no amount names nothing.
    CHECK ((limit_amount IS NULL) = (limit_kind IS NULL)),
    CHECK (limit_kind IS NULL OR limit_kind IN ('UPPER_LEVEL', 'SUGGESTED_DIETARY_TARGET')),
    -- A band with neither is a row that can say nothing at all.
    CHECK (recommended IS NOT NULL OR limit_amount IS NOT NULL)
);

-- FIBRE: AI, g/day. No UL is set -- a high intake from varied sources produces no substantial deleterious effect.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('FIBRE', 'MALE', 14, 28, NULL, NULL),
    ('FIBRE', 'MALE', 19, 30, NULL, NULL),
    ('FIBRE', 'MALE', 31, 30, NULL, NULL),
    ('FIBRE', 'MALE', 51, 30, NULL, NULL),
    ('FIBRE', 'MALE', 71, 30, NULL, NULL),
    ('FIBRE', 'FEMALE', 14, 22, NULL, NULL),
    ('FIBRE', 'FEMALE', 19, 25, NULL, NULL),
    ('FIBRE', 'FEMALE', 31, 25, NULL, NULL),
    ('FIBRE', 'FEMALE', 51, 25, NULL, NULL),
    ('FIBRE', 'FEMALE', 71, 25, NULL, NULL);

-- CALCIUM: RDI, mg/day. UL 2,500 mg/day.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('CALCIUM', 'MALE', 14, 1300, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'MALE', 19, 1000, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'MALE', 31, 1000, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'MALE', 51, 1000, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'MALE', 71, 1300, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'FEMALE', 14, 1300, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'FEMALE', 19, 1000, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'FEMALE', 31, 1000, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'FEMALE', 51, 1300, 2500, 'UPPER_LEVEL'),
    ('CALCIUM', 'FEMALE', 71, 1300, 2500, 'UPPER_LEVEL');

-- IODINE: RDI, ug/day. UL 900 ug/day to 18, then 1,100.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('IODINE', 'MALE', 14, 150, 900, 'UPPER_LEVEL'),
    ('IODINE', 'MALE', 19, 150, 1100, 'UPPER_LEVEL'),
    ('IODINE', 'MALE', 31, 150, 1100, 'UPPER_LEVEL'),
    ('IODINE', 'MALE', 51, 150, 1100, 'UPPER_LEVEL'),
    ('IODINE', 'MALE', 71, 150, 1100, 'UPPER_LEVEL'),
    ('IODINE', 'FEMALE', 14, 150, 900, 'UPPER_LEVEL'),
    ('IODINE', 'FEMALE', 19, 150, 1100, 'UPPER_LEVEL'),
    ('IODINE', 'FEMALE', 31, 150, 1100, 'UPPER_LEVEL'),
    ('IODINE', 'FEMALE', 51, 150, 1100, 'UPPER_LEVEL'),
    ('IODINE', 'FEMALE', 71, 150, 1100, 'UPPER_LEVEL');

-- IRON: RDI, mg/day. UL 45 mg/day. The band at 51 is where a woman's 18 mg drops to 8.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('IRON', 'MALE', 14, 11, 45, 'UPPER_LEVEL'),
    ('IRON', 'MALE', 19, 8, 45, 'UPPER_LEVEL'),
    ('IRON', 'MALE', 31, 8, 45, 'UPPER_LEVEL'),
    ('IRON', 'MALE', 51, 8, 45, 'UPPER_LEVEL'),
    ('IRON', 'MALE', 71, 8, 45, 'UPPER_LEVEL'),
    ('IRON', 'FEMALE', 14, 15, 45, 'UPPER_LEVEL'),
    ('IRON', 'FEMALE', 19, 18, 45, 'UPPER_LEVEL'),
    ('IRON', 'FEMALE', 31, 18, 45, 'UPPER_LEVEL'),
    ('IRON', 'FEMALE', 51, 8, 45, 'UPPER_LEVEL'),
    ('IRON', 'FEMALE', 71, 8, 45, 'UPPER_LEVEL');

-- MAGNESIUM: RDI, mg/day. The published UL of 350 mg is for magnesium taken AS A SUPPLEMENT -- it has never been shown to produce toxic effects as naturally occurring magnesium in food -- so a window of eaten food has no line to cross.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('MAGNESIUM', 'MALE', 14, 410, NULL, NULL),
    ('MAGNESIUM', 'MALE', 19, 400, NULL, NULL),
    ('MAGNESIUM', 'MALE', 31, 420, NULL, NULL),
    ('MAGNESIUM', 'MALE', 51, 420, NULL, NULL),
    ('MAGNESIUM', 'MALE', 71, 420, NULL, NULL),
    ('MAGNESIUM', 'FEMALE', 14, 360, NULL, NULL),
    ('MAGNESIUM', 'FEMALE', 19, 310, NULL, NULL),
    ('MAGNESIUM', 'FEMALE', 31, 320, NULL, NULL),
    ('MAGNESIUM', 'FEMALE', 51, 320, NULL, NULL),
    ('MAGNESIUM', 'FEMALE', 71, 320, NULL, NULL);

-- POTASSIUM: AI, mg/day. NHMRC sets no UL for potassium from dietary sources.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('POTASSIUM', 'MALE', 14, 3600, NULL, NULL),
    ('POTASSIUM', 'MALE', 19, 3800, NULL, NULL),
    ('POTASSIUM', 'MALE', 31, 3800, NULL, NULL),
    ('POTASSIUM', 'MALE', 51, 3800, NULL, NULL),
    ('POTASSIUM', 'MALE', 71, 3800, NULL, NULL),
    ('POTASSIUM', 'FEMALE', 14, 2600, NULL, NULL),
    ('POTASSIUM', 'FEMALE', 19, 2800, NULL, NULL),
    ('POTASSIUM', 'FEMALE', 31, 2800, NULL, NULL),
    ('POTASSIUM', 'FEMALE', 51, 2800, NULL, NULL),
    ('POTASSIUM', 'FEMALE', 71, 2800, NULL, NULL);

-- SELENIUM: RDI, ug/day. UL 400 ug/day.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('SELENIUM', 'MALE', 14, 70, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'MALE', 19, 70, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'MALE', 31, 70, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'MALE', 51, 70, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'MALE', 71, 70, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'FEMALE', 14, 60, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'FEMALE', 19, 60, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'FEMALE', 31, 60, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'FEMALE', 51, 60, 400, 'UPPER_LEVEL'),
    ('SELENIUM', 'FEMALE', 71, 60, 400, 'UPPER_LEVEL');

-- ZINC: RDI, mg/day. UL 35 mg/day to 18, then 40.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('ZINC', 'MALE', 14, 13, 35, 'UPPER_LEVEL'),
    ('ZINC', 'MALE', 19, 14, 40, 'UPPER_LEVEL'),
    ('ZINC', 'MALE', 31, 14, 40, 'UPPER_LEVEL'),
    ('ZINC', 'MALE', 51, 14, 40, 'UPPER_LEVEL'),
    ('ZINC', 'MALE', 71, 14, 40, 'UPPER_LEVEL'),
    ('ZINC', 'FEMALE', 14, 7, 35, 'UPPER_LEVEL'),
    ('ZINC', 'FEMALE', 19, 8, 40, 'UPPER_LEVEL'),
    ('ZINC', 'FEMALE', 31, 8, 40, 'UPPER_LEVEL'),
    ('ZINC', 'FEMALE', 51, 8, 40, 'UPPER_LEVEL'),
    ('ZINC', 'FEMALE', 71, 8, 40, 'UPPER_LEVEL');

-- VITAMIN_A: RDI, ug retinol equivalents/day. The published UL of 3,000 ug is for PREFORMED RETINOL, while AFCD reports retinol equivalents, which include the carotenoids a plant-rich diet is full of. Reading one against the other would put a carotene-heavy week over a threshold it is nowhere near, and an over-the-limit claim is the one Tucker makes at any coverage -- so there is no line here rather than a wrong one.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('VITAMIN_A', 'MALE', 14, 900, NULL, NULL),
    ('VITAMIN_A', 'MALE', 19, 900, NULL, NULL),
    ('VITAMIN_A', 'MALE', 31, 900, NULL, NULL),
    ('VITAMIN_A', 'MALE', 51, 900, NULL, NULL),
    ('VITAMIN_A', 'MALE', 71, 900, NULL, NULL),
    ('VITAMIN_A', 'FEMALE', 14, 700, NULL, NULL),
    ('VITAMIN_A', 'FEMALE', 19, 700, NULL, NULL),
    ('VITAMIN_A', 'FEMALE', 31, 700, NULL, NULL),
    ('VITAMIN_A', 'FEMALE', 51, 700, NULL, NULL),
    ('VITAMIN_A', 'FEMALE', 71, 700, NULL, NULL);

-- THIAMIN: RDI, mg/day. The UL cannot be estimated -- there are no reports of adverse effects from thiamin in food.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('THIAMIN', 'MALE', 14, 1.2, NULL, NULL),
    ('THIAMIN', 'MALE', 19, 1.2, NULL, NULL),
    ('THIAMIN', 'MALE', 31, 1.2, NULL, NULL),
    ('THIAMIN', 'MALE', 51, 1.2, NULL, NULL),
    ('THIAMIN', 'MALE', 71, 1.2, NULL, NULL),
    ('THIAMIN', 'FEMALE', 14, 1.1, NULL, NULL),
    ('THIAMIN', 'FEMALE', 19, 1.1, NULL, NULL),
    ('THIAMIN', 'FEMALE', 31, 1.1, NULL, NULL),
    ('THIAMIN', 'FEMALE', 51, 1.1, NULL, NULL),
    ('THIAMIN', 'FEMALE', 71, 1.1, NULL, NULL);

-- RIBOFLAVIN: RDI, mg/day. The UL cannot be estimated -- no adverse events are associated with riboflavin from food or supplements.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('RIBOFLAVIN', 'MALE', 14, 1.3, NULL, NULL),
    ('RIBOFLAVIN', 'MALE', 19, 1.3, NULL, NULL),
    ('RIBOFLAVIN', 'MALE', 31, 1.3, NULL, NULL),
    ('RIBOFLAVIN', 'MALE', 51, 1.3, NULL, NULL),
    ('RIBOFLAVIN', 'MALE', 71, 1.6, NULL, NULL),
    ('RIBOFLAVIN', 'FEMALE', 14, 1.1, NULL, NULL),
    ('RIBOFLAVIN', 'FEMALE', 19, 1.1, NULL, NULL),
    ('RIBOFLAVIN', 'FEMALE', 31, 1.1, NULL, NULL),
    ('RIBOFLAVIN', 'FEMALE', 51, 1.1, NULL, NULL),
    ('RIBOFLAVIN', 'FEMALE', 71, 1.3, NULL, NULL);

-- NIACIN: RDI, mg niacin equivalents/day. The published UL of 35 mg is for NICOTINIC ACID from fortified foods or supplements, set on flushing, while AFCD reports niacin derived equivalents from food -- a different substance from a different source, so no line is carried.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('NIACIN', 'MALE', 14, 16, NULL, NULL),
    ('NIACIN', 'MALE', 19, 16, NULL, NULL),
    ('NIACIN', 'MALE', 31, 16, NULL, NULL),
    ('NIACIN', 'MALE', 51, 16, NULL, NULL),
    ('NIACIN', 'MALE', 71, 16, NULL, NULL),
    ('NIACIN', 'FEMALE', 14, 14, NULL, NULL),
    ('NIACIN', 'FEMALE', 19, 14, NULL, NULL),
    ('NIACIN', 'FEMALE', 31, 14, NULL, NULL),
    ('NIACIN', 'FEMALE', 51, 14, NULL, NULL),
    ('NIACIN', 'FEMALE', 71, 14, NULL, NULL);

-- VITAMIN_B6: RDI, mg/day. UL 40 mg/day to 18, then 50, as pyridoxine -- which is what AFCD reports.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('VITAMIN_B6', 'MALE', 14, 1.3, 40, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'MALE', 19, 1.3, 50, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'MALE', 31, 1.3, 50, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'MALE', 51, 1.7, 50, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'MALE', 71, 1.7, 50, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'FEMALE', 14, 1.2, 40, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'FEMALE', 19, 1.3, 50, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'FEMALE', 31, 1.3, 50, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'FEMALE', 51, 1.5, 50, 'UPPER_LEVEL'),
    ('VITAMIN_B6', 'FEMALE', 71, 1.5, 50, 'UPPER_LEVEL');

-- VITAMIN_B12: RDI, ug/day. There are insufficient data to set a UL.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('VITAMIN_B12', 'MALE', 14, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'MALE', 19, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'MALE', 31, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'MALE', 51, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'MALE', 71, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'FEMALE', 14, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'FEMALE', 19, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'FEMALE', 31, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'FEMALE', 51, 2.4, NULL, NULL),
    ('VITAMIN_B12', 'FEMALE', 71, 2.4, NULL, NULL);

-- FOLATE: RDI, ug dietary folate equivalents/day. The published UL of 1,000 ug is for FOLIC ACID from fortified foods or supplements, set on the neurological effects it masks in B12 deficiency, while AFCD reports dietary folate equivalents -- so no line is carried.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('FOLATE', 'MALE', 14, 400, NULL, NULL),
    ('FOLATE', 'MALE', 19, 400, NULL, NULL),
    ('FOLATE', 'MALE', 31, 400, NULL, NULL),
    ('FOLATE', 'MALE', 51, 400, NULL, NULL),
    ('FOLATE', 'MALE', 71, 400, NULL, NULL),
    ('FOLATE', 'FEMALE', 14, 400, NULL, NULL),
    ('FOLATE', 'FEMALE', 19, 400, NULL, NULL),
    ('FOLATE', 'FEMALE', 31, 400, NULL, NULL),
    ('FOLATE', 'FEMALE', 51, 400, NULL, NULL),
    ('FOLATE', 'FEMALE', 71, 400, NULL, NULL);

-- VITAMIN_C: RDI, mg/day. NHMRC states it is not possible to establish a UL, naming 1,000 mg only as a prudent limit, so no line is carried.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('VITAMIN_C', 'MALE', 14, 40, NULL, NULL),
    ('VITAMIN_C', 'MALE', 19, 45, NULL, NULL),
    ('VITAMIN_C', 'MALE', 31, 45, NULL, NULL),
    ('VITAMIN_C', 'MALE', 51, 45, NULL, NULL),
    ('VITAMIN_C', 'MALE', 71, 45, NULL, NULL),
    ('VITAMIN_C', 'FEMALE', 14, 40, NULL, NULL),
    ('VITAMIN_C', 'FEMALE', 19, 45, NULL, NULL),
    ('VITAMIN_C', 'FEMALE', 31, 45, NULL, NULL),
    ('VITAMIN_C', 'FEMALE', 51, 45, NULL, NULL),
    ('VITAMIN_C', 'FEMALE', 71, 45, NULL, NULL);

-- VITAMIN_D: AI, ug/day. UL 80 ug/day. Most vitamin D is made in the skin rather than eaten, so a dietary lower bound reaches this line rarely.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('VITAMIN_D', 'MALE', 14, 5, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'MALE', 19, 5, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'MALE', 31, 5, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'MALE', 51, 10, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'MALE', 71, 15, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'FEMALE', 14, 5, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'FEMALE', 19, 5, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'FEMALE', 31, 5, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'FEMALE', 51, 10, 80, 'UPPER_LEVEL'),
    ('VITAMIN_D', 'FEMALE', 71, 15, 80, 'UPPER_LEVEL');

-- VITAMIN_E: AI, mg alpha-tocopherol equivalents/day -- what AFCD reports. UL 250 mg/day to 18, then 300.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('VITAMIN_E', 'MALE', 14, 10, 250, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'MALE', 19, 10, 300, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'MALE', 31, 10, 300, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'MALE', 51, 10, 300, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'MALE', 71, 10, 300, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'FEMALE', 14, 8, 250, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'FEMALE', 19, 7, 300, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'FEMALE', 31, 7, 300, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'FEMALE', 51, 7, 300, 'UPPER_LEVEL'),
    ('VITAMIN_E', 'FEMALE', 71, 7, 300, 'UPPER_LEVEL');

-- SODIUM: no recommended figure is carried. The AI is a RANGE (460-920 mg/day), which is nothing to reach, and clearing its lower end is not a finding worth publishing. The 2017 revision WITHDREW the adult Upper Level -- an adult's now reads 'not determined' -- and set a Suggested Dietary Target of 2,000 mg/day instead, so that is the only published line and it is carried as what it is. The 2006 UL of 2,300 mg stands unreviewed below 18, and NHMRC says an 18-year-old should take the adult figure, which is why this nutrient's bands are 14 and 18 rather than the usual five.
INSERT INTO nutrient_reference_value (nutrient, sex, from_age, recommended, limit_amount, limit_kind) VALUES
    ('SODIUM', 'MALE', 14, NULL, 2300, 'UPPER_LEVEL'),
    ('SODIUM', 'MALE', 18, NULL, 2000, 'SUGGESTED_DIETARY_TARGET'),
    ('SODIUM', 'FEMALE', 14, NULL, 2300, 'UPPER_LEVEL'),
    ('SODIUM', 'FEMALE', 18, NULL, 2000, 'SUGGESTED_DIETARY_TARGET');
