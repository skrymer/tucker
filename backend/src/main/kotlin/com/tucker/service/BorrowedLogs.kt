package com.tucker.service

import com.tucker.domain.BorrowedFood
import com.tucker.domain.BorrowedIngredient
import com.tucker.domain.BorrowedLog
import com.tucker.domain.Entry
import com.tucker.domain.FoodKind
import com.tucker.domain.RecipeIngredient
import com.tucker.domain.ReferenceFood
import com.tucker.persistence.FoodRepository
import com.tucker.persistence.RecipeRepository
import com.tucker.persistence.ReferenceFoodRepository
import com.tucker.persistence.foodsOf
import org.springframework.stereotype.Component

/** Joins logged Entries to the Foods they ate and to what each of those borrows (ADR 0027). */
@Component
class BorrowedLogs(
    private val foods: FoodRepository,
    private val recipes: RecipeRepository,
    private val referenceFoods: ReferenceFoodRepository,
) {

    /** [logged], with every Food it names joined. Read inside the caller's transaction. */
    fun of(logged: List<Entry>): BorrowedLog {
        val catalog = foods.foodsOf(logged)
        // A Recipe is never matched — it rolls up from whichever of its ingredients
        // are (ADR 0027) — so its composition is read alongside the catalog, and its
        // ingredients' own borrows are resolved in the same pass as the catalog's.
        val compositions = recipes.ingredientsOf(catalog.filterValues { it.kind is FoodKind.Recipe }.keys)
        val eatenFoods = catalog.values + compositions.values.flatten().map { it.ingredient }
        val borrowed = referenceFoods.findByIds(eatenFoods.mapNotNull { it.referenceFoodId }.toSet())
        val eaten = catalog.mapValues { (id, food) ->
            BorrowedFood(food, borrowed[food.referenceFoodId], compositions[id].orEmpty().map { it.borrow(borrowed) })
        }
        return BorrowedLog(logged, eaten)
    }
}

/** One ingredient line joined to what its Food borrows, if anything. */
private fun RecipeIngredient.borrow(references: Map<Long, ReferenceFood>) =
    BorrowedIngredient(BorrowedFood(ingredient, references[ingredient.referenceFoodId]), grams)
