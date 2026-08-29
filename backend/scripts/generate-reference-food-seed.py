#!/usr/bin/env python3
"""Generate the Flyway migration that seeds `reference_food` from an AFCD release.

Run once per release of the Australian Food Composition Database (FSANZ), which
moves about twice a decade -- a new release is a NEW migration and a pull request,
never an edit to an applied one (ADR 0027).

    python3 backend/scripts/generate-reference-food-seed.py \
        --xlsx 'AFCD Release 3 - Nutrient profiles.xlsx' \
        --out backend/src/main/resources/db/migration/V16__seed_reference_food.sql \
        --release 'Release 3'

The `.xlsx` is a zip of XML, so this reads it with the standard library alone --
no openpyxl, no pandas. Columns are matched on the header *string* rather than on
the column letter, because letters shift between releases while the FSANZ nutrient
names do not.
"""

import argparse
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# The sheet holding every food per 100 g. Sheet 0 is a contents page, and the
# `Liquids only per 100 mL` sheet is ignored: Tucker weighs liquids in grams at
# density 1.0 (ADR 0006), so the per-100 g figures are the ones it can use.
SHEET_INDEX = 1
HEADER_ROW = 3  # 1-based, as the spreadsheet numbers them; data starts at 4.

KEY_HEADER = "Public Food Key"
NAME_HEADER = "Food Name"

# The 19 curated nutrients, as `(column, AFCD header)`. Several have a near
# neighbour in the same sheet that is silently the wrong measurement, and the
# choices below are load-bearing for ADR 0027's no-fallback argument:
# `Niacin (B3)` is preformed niacin only, `Total folates` is not folate
# equivalents, and `Retinol` is not retinol equivalents.
NUTRIENTS = [
    ("fibre_g", "Total dietary fibre (g)"),
    ("calcium_mg", "Calcium (Ca) (mg)"),
    ("iodine_ug", "Iodine (I) (ug)"),
    ("iron_mg", "Iron (Fe) (mg)"),
    ("magnesium_mg", "Magnesium (Mg) (mg)"),
    ("potassium_mg", "Potassium (K) (mg)"),
    ("selenium_ug", "Selenium (Se) (ug)"),
    ("sodium_mg", "Sodium (Na) (mg)"),
    ("zinc_mg", "Zinc (Zn) (mg)"),
    ("vitamin_a_ug", "Vitamin A retinol equivalents (ug)"),
    ("thiamin_mg", "Thiamin (B1) (mg)"),
    ("riboflavin_mg", "Riboflavin (B2) (mg)"),
    ("niacin_mg", "Niacin derived equivalents (mg)"),
    ("vitamin_b6_mg", "Pyridoxine (B6) (mg)"),
    ("vitamin_b12_ug", "Cobalamin (B12) (ug)"),
    ("folate_ug", "Dietary folate equivalents (ug)"),
    ("vitamin_c_mg", "Vitamin C (mg)"),
    ("vitamin_d_ug", "Vitamin D3 equivalents (ug)"),
    ("vitamin_e_mg", "Vitamin E (mg)"),
]

# Rows per INSERT. `prepareJooqDatabase` splits a migration on `;` and executes
# the statements one at a time, so one statement per food would parse 1,588 of
# them on every jOOQ codegen. Kept well under SQLite's 500-row compound limit.
ROWS_PER_INSERT = 100


def column_index(letters):
    """Zero-based index of a spreadsheet column reference (`A` -> 0, `BD` -> 55)."""
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def read_sheet(xlsx_path):
    """Yield each row of the nutrient sheet as a dict of column index -> text."""
    with zipfile.ZipFile(xlsx_path) as z:
        shared = [
            "".join(t.text or "" for t in si.iter(NS + "t"))
            for si in ET.fromstring(z.read("xl/sharedStrings.xml"))
        ]
        workbook = ET.fromstring(z.read("xl/workbook.xml"))
        sheets = workbook.find(NS + "sheets")
        rel_id = sheets[SHEET_INDEX].attrib[
            "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
        ]
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = next(
            r.attrib["Target"] for r in rels if r.attrib["Id"] == rel_id
        ).lstrip("/")
        with z.open("xl/" + target) as sheet:
            for _, el in ET.iterparse(sheet, events=("end",)):
                if el.tag != NS + "row":
                    continue
                yield int(el.attrib["r"]), cells_of(el, shared)
                el.clear()


def cells_of(row, shared):
    cells = {}
    next_index = 0
    for c in row.iter(NS + "c"):
        ref = c.attrib.get("r")
        i = column_index(re.match(r"([A-Z]+)", ref).group(1)) if ref else next_index
        next_index = i + 1
        kind = c.attrib.get("t")
        if kind == "inlineStr":
            value = "".join(t.text or "" for t in c.iter(NS + "t"))
        else:
            v = c.find(NS + "v")
            value = v.text if v is not None else None
            if kind == "s" and value is not None:
                value = shared[int(value)]
        cells[i] = value
    return cells


def normalise(text):
    """Collapse the newlines FSANZ embeds in its header cells."""
    return re.sub(r"\s+", " ", text or "").strip()


def sql_string(text):
    return "'" + text.replace("'", "''") + "'"


def sql_number(text, where):
    value = float(text)
    if value != value or value in (float("inf"), float("-inf")):
        raise ValueError(f"{where}: {text!r} is not a finite number")
    # Trim a float that is exactly an integer back to how AFCD wrote it, so the
    # generated file is as close to the source as SQL allows.
    return str(int(value)) if value.is_integer() else repr(value)


def build_rows(xlsx_path):
    columns = {}
    rows = []
    for number, cells in read_sheet(xlsx_path):
        if number == HEADER_ROW:
            by_header = {}
            for index, value in cells.items():
                by_header.setdefault(normalise(value), index)
            for header in [KEY_HEADER, NAME_HEADER] + [h for _, h in NUTRIENTS]:
                if header not in by_header:
                    raise SystemExit(f"header not found in the release: {header!r}")
                columns[header] = by_header[header]
        elif number > HEADER_ROW:
            if not columns:
                raise SystemExit(f"row {number} precedes the header row")
            rows.append(read_food(number, cells, columns))
    return rows


def read_food(number, cells, columns):
    def cell(header):
        value = cells.get(columns[header])
        if value is None or value.strip() == "":
            raise SystemExit(f"row {number}: {header!r} is empty")
        return value.strip()

    values = [sql_string(cell(KEY_HEADER)), sql_string(cell(NAME_HEADER))]
    values += [
        sql_number(cell(header), f"row {number}, {header!r}") for _, header in NUTRIENTS
    ]
    return values


def render(rows, release, source):
    columns = ["public_food_key", "name"] + [c for c, _ in NUTRIENTS]
    out = [HEADER.format(release=release, source=source, count=len(rows))]
    out.append(SCHEMA.format(columns="\n".join(schema_lines())))
    for start in range(0, len(rows), ROWS_PER_INSERT):
        chunk = rows[start : start + ROWS_PER_INSERT]
        out.append(
            "INSERT INTO reference_food (%s) VALUES\n%s;\n"
            % (
                ", ".join(columns),
                ",\n".join("    (%s)" % ", ".join(row) for row in chunk),
            )
        )
    return "\n".join(out)


def schema_lines():
    width = max(len(c) for c, _ in NUTRIENTS)
    last = len(NUTRIENTS) - 1
    return [
        f"    {column.ljust(width)} REAL NOT NULL{',' if i < last else ' '} -- {header}"
        for i, (column, header) in enumerate(NUTRIENTS)
    ]


HEADER = """\
-- GENERATED FILE -- do not edit by hand.
--
-- The Australian Food Composition Database (FSANZ), {release}, as the global
-- `reference_food` table a Food borrows its micronutrients from (ADR 0027).
-- Regenerate with:
--
--     python3 backend/scripts/generate-reference-food-seed.py \\
--         --xlsx '<{release} - Nutrient profiles.xlsx>' \\
--         --out  <this file> --release '{release}'
--
-- A new AFCD release is a NEW migration, never an edit to this one: editing an
-- applied migration changes its checksum and Flyway then refuses to start
-- against any database that already ran it.
--
-- Global and unowned, like `app_config` -- a Reference Food describes a generic
-- food, not one person's, so it carries no `user_id` (ADR 0021). The owned side
-- is `food.reference_food_id`, added in V17.
--
-- Source: {source}
-- Licence: CC BY-SA 3.0 AU. Attribution, the Limitation of Data Statement and
-- the "based on Australian data" notice are carried wherever the figures are
-- read -- see ReferenceFoodAttribution.
--
-- {count} foods, all 19 curated nutrients populated on every one of them, which
-- is what makes a fallback source unnecessary rather than merely unbuilt
-- (ADR 0027). ReferenceFoodSeedMigrationTest asserts both rather than trusting
-- this comment.
"""

SCHEMA = """\
CREATE TABLE reference_food (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    -- AFCD's own identifier, stable across releases. It is what lets a later
    -- release re-seed this table while every Food already matched keeps
    -- pointing at the same food.
    public_food_key TEXT NOT NULL UNIQUE,
    -- As FSANZ writes it: `Head, qualifier, qualifier, state`. The head is the
    -- food, and the search index splits on that first comma (V17).
    name            TEXT NOT NULL UNIQUE,
{columns}
);
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--xlsx", required=True, help="AFCD Nutrient profiles workbook")
    parser.add_argument("--out", required=True, help="migration file to write")
    parser.add_argument("--release", required=True, help="e.g. 'Release 3'")
    parser.add_argument(
        "--source",
        default="https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd",
        help="where the workbook was downloaded from",
    )
    args = parser.parse_args()

    rows = build_rows(args.xlsx)
    if not rows:
        raise SystemExit("the release yielded no foods")
    with open(args.out, "w", encoding="utf-8") as f:
        f.write(render(rows, args.release, args.source))
    print(f"wrote {len(rows)} foods to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
