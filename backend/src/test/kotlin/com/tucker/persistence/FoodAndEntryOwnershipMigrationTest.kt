package com.tucker.persistence

import org.flywaydb.core.api.FlywayException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.sql.Connection
import java.sql.SQLException
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * V13 rebuilds `food` and `entry` so `user_id` may not be null, and rebuilds
 * `recipe_ingredient` along the way so that `food` can be dropped at all
 * (issue #232, ADR 0021).
 *
 * It is the only rebuild in the schema that touches a table other tables *reference*,
 * and it copies three tables by hand rather than one — so it is the most able of them
 * to pass every empty-database check and still be wrong. Shape and reasoning as
 * [PerUserUniquenessMigrationTest]: fill the catalog and the log the way one person's
 * installation fills them, then migrate forward with foreign keys enforced.
 */
class FoodAndEntryOwnershipMigrationTest {

    @TempDir lateinit var tempDir: Path

    @Test
    fun `a database recorded before multi-user keeps its Foods, Recipes and Entries`() {
        val db = tempDir.resolve("pre-multi-user.db").toString()

        migrate(db, upTo = "8")
        connect(db).use { seedOnePersonsCatalogAndLog(it) }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            // Every column, and the ids, which an Entry, an ingredient line and a URL name.
            assertEquals(
                listOf(
                    "4|Rolled oats|FOOD|0012345678905|379.0|13.2|67.7|6.5||" +
                        "2025-11-02 07:14:03|2025-11-02 07:14:03|1",
                    "7|Sunday bolognese|RECIPE||344.75|29.3|||800.0|" +
                        "2026-01-04 18:22:09|2026-01-11 19:03:44|1",
                    "12|Beef mince|FOOD||250.0|26.0|0.0|15.0||" +
                        "2025-12-19 16:40:55|2025-12-19 16:40:55|1",
                ),
                connection.rows(
                    "SELECT id, name, kind, barcode, calories_per_100g, protein_per_100g, " +
                        "carbs_per_100g, fat_per_100g, cooked_weight_g, created_at, updated_at, " +
                        "user_id FROM food ORDER BY id",
                ),
                "every Food should come through the rebuild intact, and still be the owner's — " +
                    "losing `kind` would turn a Recipe into an ordinary Food, and losing " +
                    "`cooked_weight_g` would leave it unreadable and unrecalibratable (ADR 0019)",
            )
            assertEquals(
                listOf("5|7|12|800.0", "6|7|4|200.0"),
                connection.rows(
                    "SELECT id, recipe_id, ingredient_food_id, grams FROM recipe_ingredient ORDER BY id",
                ),
                "the ingredient lines are rewritten for `food`'s benefit rather than their own, " +
                    "which makes them the rows nobody thinks to check",
            )
            assertEquals(
                listOf(
                    "3|2026-01-14|WEIGHED|4|80.0||303.2|10.6|2026-01-14 07:31:00|1",
                    "9|2026-01-14|ESTIMATED|||Thai takeaway|700.0||2026-01-14 19:48:12|1",
                ),
                connection.rows(
                    "SELECT id, logged_on, kind, food_id, grams, label, calories, protein, " +
                        "created_at, user_id FROM entry ORDER BY id",
                ),
                "both kinds of Entry should survive — an ESTIMATED one carries a label and no " +
                    "Food, a WEIGHED one a Food and grams, and the rebuild must not blur them",
            )
            // On the way *through*, not only on the way back out of a rollback: a holding
            // table left behind would be a permanent constraint-free duplicate of the log,
            // replicated off-host by Litestream and generated as a jOOQ table class.
            assertEquals(
                emptyList(),
                connection.tableNames().filter { it in SCRATCH_TABLES },
                "the tables V13 builds along the way must not outlive it",
            )
        }
    }

    /**
     * A rebuild is exactly where a foreign key gets quietly dropped, or quietly changes
     * what it does: all three tables are hand-written here, and nothing about the copied
     * rows would say so. Read off the schema, so no fixture is needed to see it.
     */
    @Test
    fun `the rebuild keeps every foreign key, and what each one does on a delete`() {
        val db = tempDir.resolve("reference-graph.db").toString()

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("user_id" to "user"),
                connection.foreignKeysOf("food"),
                "`food.user_id` must be a foreign key to `user`, not a loose integer",
            )
            assertEquals(
                listOf("food_id" to "food", "user_id" to "user"),
                connection.foreignKeysOf("entry").sortedBy { (from, _) -> from },
                "an Entry must still name both the User who logged it and the Food it weighed",
            )
            assertEquals(
                listOf("ingredient_food_id" to "food", "recipe_id" to "food"),
                connection.foreignKeysOf("recipe_ingredient").sortedBy { (from, _) -> from },
                "an ingredient line must still name both its Recipe and the Food it weighs in",
            )

            // An edge can survive a rebuild while what it *does* changes, and every edge into
            // `food` governs a rule a shipped slice depends on. Read all four, so none is
            // covered only by the graph above — which stays correct under every swap.
            assertEquals(
                mapOf(
                    "recipe_ingredient.recipe_id" to "CASCADE",
                    "recipe_ingredient.ingredient_food_id" to "NO ACTION",
                    "entry.food_id" to "NO ACTION",
                    "entry.user_id" to "NO ACTION",
                ),
                listOf(
                    "recipe_ingredient" to "recipe_id",
                    "recipe_ingredient" to "ingredient_food_id",
                    "entry" to "food_id",
                    "entry" to "user_id",
                ).associate { (table, column) ->
                    "$table.$column" to connection.onDeleteActionOf(table, column)
                },
                "deleting a Recipe takes its own ingredient lines with it, and nothing else " +
                    "cascades: a Food some Recipe weighs in cannot be deleted (issue #145), " +
                    "and neither can one an Entry recorded — a cascade on `entry.food_id` " +
                    "would delete every Entry that recorded eating it",
            )
        }
    }

    /**
     * The same refusal with only the Entry unattributable, because `entry` has its own
     * adoption statement and its own copy and the test above cannot reach either: the
     * unowned Food refuses the migration first, at the earlier statement.
     *
     * So without this, a missing one-User guard on the Entry — handing somebody else's day
     * to whichever User the subquery found — and a copy that skipped unowned rows, deleting
     * it outright, would both pass the whole suite. Both were confirmed to do exactly that
     * before this test existed.
     */
    @Test
    fun `an unowned Entry alone refuses the migration too`() {
        val db = tempDir.resolve("ambiguous-entry.db").toString()

        migrate(db, upTo = "8")
        connect(db).use { seedOnePersonsCatalogAndLog(it) }
        migrate(db, upTo = "12")
        connect(db).use { connection ->
            connection.seedSecondUser()
            connection.execute(UNOWNED_ENTRY)
        }

        assertFailsWith<FlywayException>(
            "an Entry nobody can be attributed must refuse the migration as loudly as a Food",
        ) { migrate(db, upTo = null) }

        connect(db).use { connection ->
            assertEquals(
                listOf("Works canteen"),
                connection.rows("SELECT label FROM entry WHERE user_id IS NULL"),
                "and it must still be there, unowned — neither adopted by a guess nor dropped",
            )
        }
    }

    /**
     * The rest of what a hand-written rebuild can drop while every stored value still
     * reads back correctly: the constraints and defaults that only refuse the *next* bad
     * row, and the indexes.
     *
     * `idx_food_user_barcode` is the sharp one, because nothing else in the project
     * enforces it. `FoodRepository` runs no duplicate check, the domain has no such rule,
     * and `CrossUserIsolationTest` asserts only the permissive half (two Users may each
     * hold the same barcode) — which passes with no index at all. So without this,
     * deleting the `CREATE UNIQUE INDEX` from V13 would drop an ADR 0021 decision out of
     * the schema and leave the whole suite green.
     */
    @Test
    fun `the rebuild keeps the constraints and indexes that only refuse the next bad row`() {
        val db = tempDir.resolve("constraints.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedTwoUsers()
            connection.execute(
                "INSERT INTO food (id, name, barcode, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES (1, 'Skyr', '5701234567890', 63, 11, $OWNER_ID)",
            )

            assertFailsWith<SQLException>(
                "a User should not be able to hold the same barcode twice — the rule V10 " +
                    "moved per User, which no repository or domain object enforces",
            ) {
                connection.execute(
                    "INSERT INTO food (name, barcode, calories_per_100g, protein_per_100g, user_id) " +
                        "VALUES ('Skyr again', '5701234567890', 63, 11, $OWNER_ID)",
                )
            }
            // And somebody else's identical barcode must still be fine, or the index has
            // merely been left global under a new name.
            connection.execute(
                "INSERT INTO food (name, barcode, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES ('Skyr', '5701234567890', 63, 11, $SECOND_USER_ID)",
            )

            REFUSED_ROWS.forEach { (what, insert) ->
                assertFailsWith<SQLException>(
                    "the rebuild dropped the constraint that refuses $what",
                ) { connection.execute(insert) }
            }

            // The indexes go the same way as the constraints — recreated by hand, invisible
            // in every stored value. `idx_entry_logged_on` is the one that earns its keep:
            // every daily-summary read finds its day through it.
            assertEquals(
                listOf(
                    "idx_entry_logged_on",
                    "idx_food_kind",
                    "idx_food_user_barcode",
                    "idx_recipe_ingredient_recipe",
                ),
                connection.rows(
                    "SELECT name FROM sqlite_master WHERE type = 'index' " +
                        "AND tbl_name IN ('food', 'entry', 'recipe_ingredient') " +
                        "AND name NOT LIKE 'sqlite_%' ORDER BY name",
                ),
                "the rebuild must put every index back on the tables it rewrote",
            )

            // Defaults survive a rebuild silently too: a Food written without `kind` is a
            // FOOD, and one written without timestamps is stamped now rather than null.
            connection.execute(
                "INSERT INTO food (id, name, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES (9, 'Oats', 379, 13.2, $OWNER_ID)",
            )
            assertEquals(
                listOf("FOOD|1|1"),
                connection.rows(
                    "SELECT kind, created_at IS NOT NULL, updated_at IS NOT NULL FROM food WHERE id = 9",
                ),
                "a Food written without them must still default to FOOD and be stamped",
            )
        }
    }

    /**
     * The rows written between V9 (which added `user_id`, nullable) and slice 3 (which
     * taught the repositories to stamp it) carry no owner at all.
     *
     * Every rebuild before this one adopted such rows because the slice doing the rebuild
     * was also the slice doing the scoping, so the row was still live. That argument has
     * expired here — `food` and `entry` were scoped in slice 3, so an unowned one has been
     * invisible to its own author ever since. What replaces it is blunter: an unowned Food
     * may still be *referenced*, so deleting it is not merely wasteful, it is referentially
     * impossible (ADR 0021).
     */
    @Test
    fun `a Food or Entry recorded with no owner is adopted, not discarded`() {
        val db = tempDir.resolve("unowned.db").toString()

        migrate(db, upTo = "8")
        connect(db).use { seedOnePersonsCatalogAndLog(it) }
        migrate(db, upTo = "12")
        connect(db).use { connection -> UNOWNED_AFTER_V9.forEach(connection::execute) }

        migrate(db, upTo = null)

        connect(db).use { connection ->
            assertEquals(
                listOf("Beef mince", "Rolled oats", "Split peas", "Sunday bolognese"),
                connection.rows("SELECT name FROM food ORDER BY name"),
                "the unowned Food is the owner's own, added before the column was filled " +
                    "in — and an Entry names it, so discarding it would take that Entry too",
            )
            assertEquals(
                listOf("Thai takeaway", "Works canteen"),
                connection.rows("SELECT label FROM entry WHERE label IS NOT NULL ORDER BY label"),
                "an Entry is what the day's calories are made of, so an unowned one is " +
                    "adopted rather than dropped out of the log it belongs to",
            )
            // By count as well as by label, because the unowned *weighed* Entry — the one
            // naming the unowned Food, which is what makes deleting that Food referentially
            // impossible — has no label to be found by, so the assertion above is blind to it.
            assertEquals(
                listOf("4"),
                connection.rows("SELECT count(*) FROM entry"),
                "every Entry survives, weighed ones included",
            )
            listOf("food", "entry").forEach { table ->
                assertEquals(
                    emptyList(),
                    connection.rows("SELECT id FROM $table WHERE user_id IS NOT $OWNER_ID"),
                    "everything in `$table` ends up belonging to the one User there was to adopt it",
                )
            }
        }
    }

    /**
     * The other half of the adoption rule: when attribution *would* be a guess, the
     * migration must refuse rather than pick somebody — and must leave the database
     * exactly as it found it.
     *
     * That claim is worth more here than in any rebuild before it. V13 drops `entry` and
     * `recipe_ingredient` before it touches `food`, so the moment it fails is the moment
     * the log and every Recipe's composition exist only inside the transaction. Were it
     * running non-transactionally — as ADR 0021 originally priced this rebuild — a refusal
     * would leave a database with no `entry` table at all.
     *
     * Exactly one unattributable row, and it is a Food. Seeding an unowned Entry here too
     * would look thorough and quietly cost the test its point: with either row able to
     * refuse the migration, dropping the *Food*'s one-User guard — or a food copy that
     * skipped unowned rows and deleted it — would still be refused, by the other row. The
     * Entry's own half is covered by the test below, on a database where it is the only
     * unattributable row there is.
     */
    @Test
    fun `an unowned Food nobody can be attributed refuses the migration, and rolls it back`() {
        val db = tempDir.resolve("ambiguous.db").toString()

        migrate(db, upTo = "8")
        connect(db).use { seedOnePersonsCatalogAndLog(it) }
        migrate(db, upTo = "12")
        connect(db).use { connection ->
            connection.seedSecondUser()
            connection.execute(UNOWNED_FOOD)
        }

        assertFailsWith<FlywayException>(
            "with two Users, an unowned Food cannot be attributed — guessing is worse than refusing",
        ) { migrate(db, upTo = null) }

        connect(db).use { connection ->
            assertEquals(
                emptyList(),
                connection.rows("SELECT version FROM flyway_schema_history WHERE version = '13'"),
                "the failed migration must not be recorded as applied",
            )
            // Rolled back *whole*, not merely unrecorded. The log and the ingredient lines
            // are the assertion that discriminates: V13 drops both tables before the INSERT
            // it fails on, so a non-transactional run would leave them gone for good.
            assertEquals(
                listOf("3|4|1", "9||1"),
                connection.rows("SELECT id, food_id, user_id FROM entry ORDER BY id"),
                "every Entry must still be there — at the point V13 fails, the `entry` table " +
                    "exists only inside the transaction",
            )
            assertEquals(
                listOf("5|7|12|800.0", "6|7|4|200.0"),
                connection.rows(
                    "SELECT id, recipe_id, ingredient_food_id, grams FROM recipe_ingredient ORDER BY id",
                ),
                "and so must every ingredient line, or the Recipe that owns them is a name " +
                    "with no composition behind it",
            )
            assertEquals(
                emptyList(),
                connection.tableNames().filter { it in SCRATCH_TABLES },
                "the half-built table and the holding tables must be gone — they are what a " +
                    "non-transactional migration would leave behind at the point V13 fails",
            )
            assertEquals(
                listOf("Split peas"),
                connection.rows("SELECT name FROM food WHERE user_id IS NULL"),
                "and the row it could not attribute is still there for a human to resolve",
            )
        }
    }

    @Test
    fun `a Food or Entry written with no owner is refused`() {
        val db = tempDir.resolve("not-null.db").toString()
        migrate(db, upTo = null)

        connect(db).use { connection ->
            connection.seedOwner()

            UNOWNED_ROWS.forEach { (table, insert) ->
                val refusal = assertFailsWith<SQLException>(
                    "`$table` should refuse a row with no owner — the invariant the " +
                        "repositories have held since slice 3 is now the database's too (ADR 0021)",
                ) { connection.execute(insert) }
                assertTrue(
                    refusal.message.orEmpty().contains("NOT NULL"),
                    "`$table` refused the row for the wrong reason: ${refusal.message}",
                )
            }
        }
    }

    /**
     * Fill the catalog and the log the way one person's use fills them, at the last
     * version before multi-user.
     *
     * Every column that a rebuild could drop *silently* is seeded away from its schema
     * default: a Recipe beside two Foods so `kind` discriminates, `created_at` and
     * `updated_at` set to different instants so swapping them shows, the optional macros
     * present on some rows and absent on others so a dropped column cannot hide behind a
     * null, and ids that are not the rowids SQLite would re-mint — 4, 7, 12 and 3, 9
     * rather than 1, 2, 3 — because a copy that omits `id` reads back as 1, 2, 3 and passes.
     *
     * The barcode has a leading zero, which is what it looks like when a rebuild loses a
     * column's declared type: '0012345678905' stored under numeric affinity comes back as
     * 12345678905, and the product can never be scanned again.
     *
     * The Recipe's stored per-100 g is the one its own ingredient lines produce, because a
     * fixture is a claim about what the app writes: 800 g of mince and 200 g of oats are
     * 2758 kcal and 234.4 g of protein, and 800 g of finished bolognese re-expresses that
     * as 344.75 kcal and 29.3 g per 100 g (ADR 0019). The oats are both logged and weighed
     * into the Recipe, which is the ordinary way one Food ends up in both roles.
     */
    private fun seedOnePersonsCatalogAndLog(connection: Connection) = connection.createStatement().use {
        it.executeUpdate(
            "INSERT INTO food (id, name, kind, barcode, calories_per_100g, protein_per_100g, " +
                "carbs_per_100g, fat_per_100g, created_at, updated_at) " +
                "VALUES (4, 'Rolled oats', 'FOOD', '0012345678905', 379, 13.2, 67.7, 6.5, " +
                "'2025-11-02 07:14:03', '2025-11-02 07:14:03')",
        )
        it.executeUpdate(
            "INSERT INTO food (id, name, kind, calories_per_100g, protein_per_100g, " +
                "carbs_per_100g, fat_per_100g, created_at, updated_at) " +
                "VALUES (12, 'Beef mince', 'FOOD', 250, 26, 0, 15, " +
                "'2025-12-19 16:40:55', '2025-12-19 16:40:55')",
        )
        // A Recipe: a Food row with its cooked weight, edited after it was created (ADR 0019).
        it.executeUpdate(
            "INSERT INTO food (id, name, kind, calories_per_100g, protein_per_100g, " +
                "cooked_weight_g, created_at, updated_at) " +
                "VALUES (7, 'Sunday bolognese', 'RECIPE', 344.75, 29.3, 800, " +
                "'2026-01-04 18:22:09', '2026-01-11 19:03:44')",
        )
        it.executeUpdate(
            "INSERT INTO recipe_ingredient (id, recipe_id, ingredient_food_id, grams) " +
                "VALUES (5, 7, 12, 800)",
        )
        it.executeUpdate(
            "INSERT INTO recipe_ingredient (id, recipe_id, ingredient_food_id, grams) " +
                "VALUES (6, 7, 4, 200)",
        )
        it.executeUpdate(
            "INSERT INTO entry (id, logged_on, kind, food_id, grams, calories, protein, created_at) " +
                "VALUES (3, '2026-01-14', 'WEIGHED', 4, 80, 303.2, 10.6, '2026-01-14 07:31:00')",
        )
        it.executeUpdate(
            "INSERT INTO entry (id, logged_on, kind, label, calories, created_at) " +
                "VALUES (9, '2026-01-14', 'ESTIMATED', 'Thai takeaway', 700, '2026-01-14 19:48:12')",
        )
    }

    private companion object {
        /** The tables V13 builds along the way, none of which may outlive it. */
        val SCRATCH_TABLES = listOf("food_new", "entry_parked", "recipe_ingredient_parked")

        /** What a Food looked like between V9 and slice 3: in the catalog, owned by nobody. */
        const val UNOWNED_FOOD =
            "INSERT INTO food (id, name, calories_per_100g, protein_per_100g) " +
                "VALUES (11, 'Split peas', 341, 24.6)"

        /** And what an Entry looked like: in the log, counted, owned by nobody. */
        const val UNOWNED_ENTRY =
            "INSERT INTO entry (logged_on, kind, label, calories) " +
                "VALUES ('2026-01-16', 'ESTIMATED', 'Works canteen', 850)"

        /**
         * A week of ordinary use on a database between V9 and slice 3: real rows, written
         * by repositories that did not yet stamp an owner. The weighed Entry names the
         * unowned Food, which is the shape that makes deleting one referentially
         * impossible rather than merely lossy.
         */
        val UNOWNED_AFTER_V9 = listOf(
            UNOWNED_FOOD,
            "INSERT INTO entry (logged_on, kind, food_id, grams, calories, protein) " +
                "VALUES ('2026-01-16', 'WEIGHED', 11, 120, 409.2, 29.5)",
            UNOWNED_ENTRY,
        )

        /** One well-formed row per rebuilt table, differing from a real one only in having no owner. */
        val UNOWNED_ROWS = listOf("food" to UNOWNED_FOOD, "entry" to UNOWNED_ENTRY)

        /**
         * One row per `CHECK` and per `NOT NULL` the rebuild re-types by hand, each
         * violating exactly one of them — violating two would let the row be refused by
         * the constraint the test was not aiming at. Neither kind changes a stored value
         * when it is dropped, the table simply stops refusing the next bad row, so nothing
         * else in this class would notice one had gone.
         *
         * One exception, which is unreachable rather than missing: `entry`'s
         * `CHECK (kind IN ('WEIGHED', 'ESTIMATED'))` is subsumed by the table-level shape
         * CHECK below it, whose two branches each pin `kind` to one of those values. No row
         * can violate the first without violating the second, so dropping it from the
         * rebuild changes what the table accepts not at all — and nothing can assert it.
         */
        val REFUSED_ROWS = listOf(
            "a Food that is neither a FOOD nor a RECIPE" to
                "INSERT INTO food (name, kind, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES ('Mystery', 'MEAL', 100, 10, $OWNER_ID)",
            "a Food with negative calories" to
                "INSERT INTO food (name, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES ('Antimatter', -1, 10, $OWNER_ID)",
            "a Food with negative protein" to
                "INSERT INTO food (name, calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES ('Antimatter', 100, -1, $OWNER_ID)",
            "a Food with no name" to
                "INSERT INTO food (calories_per_100g, protein_per_100g, user_id) " +
                    "VALUES (100, 10, $OWNER_ID)",
            "a WEIGHED Entry with no Food" to
                "INSERT INTO entry (logged_on, kind, grams, calories, user_id) " +
                    "VALUES ('2026-01-16', 'WEIGHED', 80, 300, $OWNER_ID)",
            "an ESTIMATED Entry with no label" to
                "INSERT INTO entry (logged_on, kind, calories, user_id) " +
                    "VALUES ('2026-01-16', 'ESTIMATED', 300, $OWNER_ID)",
            "a WEIGHED Entry weighing nothing" to
                "INSERT INTO entry (logged_on, kind, food_id, grams, calories, user_id) " +
                    "VALUES ('2026-01-16', 'WEIGHED', 1, 0, 300, $OWNER_ID)",
            "an Entry with negative calories" to
                "INSERT INTO entry (logged_on, kind, label, calories, user_id) " +
                    "VALUES ('2026-01-16', 'ESTIMATED', 'Lunch', -1, $OWNER_ID)",
            "an Entry with negative protein" to
                "INSERT INTO entry (logged_on, kind, label, calories, protein, user_id) " +
                    "VALUES ('2026-01-16', 'ESTIMATED', 'Lunch', 300, -1, $OWNER_ID)",
            "an Entry on no day" to
                "INSERT INTO entry (kind, label, calories, user_id) " +
                    "VALUES ('ESTIMATED', 'Lunch', 300, $OWNER_ID)",
            "an ingredient line weighing nothing" to
                "INSERT INTO recipe_ingredient (recipe_id, ingredient_food_id, grams) VALUES (1, 1, 0)",
            "an ingredient line belonging to no Recipe" to
                "INSERT INTO recipe_ingredient (ingredient_food_id, grams) VALUES (1, 100)",
        )
    }
}
