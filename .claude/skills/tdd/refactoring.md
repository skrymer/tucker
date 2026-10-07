# Refactor Candidates

After a TDD cycle, look for a smell, then apply the catalog move that removes it. Each
move is named as in Fowler's [refactoring catalog](https://refactoring.com/catalog/), so
the name is a lookup, not a paraphrase. Run the tests after each move; keep them on the
public interface.

The linters raise most of these for you. `frontend-dev` and `backend-dev` each map their
rule IDs to the smells below.

| Smell | Catalog move |
| --- | --- |
| **Long Function** | [Extract Function](https://refactoring.com/catalog/extractFunction.html), [Decompose Conditional](https://refactoring.com/catalog/decomposeConditional.html), [Split Phase](https://refactoring.com/catalog/splitPhase.html), [Replace Temp with Query](https://refactoring.com/catalog/replaceTempWithQuery.html) |
| **Nested conditionals** (cognitive complexity, block depth) | [Replace Nested Conditional with Guard Clauses](https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html), [Decompose Conditional](https://refactoring.com/catalog/decomposeConditional.html), [Consolidate Conditional Expression](https://refactoring.com/catalog/consolidateConditionalExpression.html) |
| **Repeated switch on a type** | [Replace Conditional with Polymorphism](https://refactoring.com/catalog/replaceConditionalWithPolymorphism.html) |
| **Long Parameter List** | [Introduce Parameter Object](https://refactoring.com/catalog/introduceParameterObject.html), [Preserve Whole Object](https://refactoring.com/catalog/preserveWholeObject.html), [Replace Parameter with Query](https://refactoring.com/catalog/replaceParameterWithQuery.html), [Remove Flag Argument](https://refactoring.com/catalog/removeFlagArgument.html) |
| **Large Class / long file** | [Extract Class](https://refactoring.com/catalog/extractClass.html), [Move Function](https://refactoring.com/catalog/moveFunction.html) |
| **Duplicated Code** | [Extract Function](https://refactoring.com/catalog/extractFunction.html), [Slide Statements](https://refactoring.com/catalog/slideStatements.html), [Pull Up Method](https://refactoring.com/catalog/pullUpMethod.html) |
| **Feature Envy** | [Move Function](https://refactoring.com/catalog/moveFunction.html) to where the data lives |
| **Primitive Obsession** | [Replace Primitive with Object](https://refactoring.com/catalog/replacePrimitiveWithObject.html) (a value object) |
| **Mutable Data** | [Separate Query from Modifier](https://refactoring.com/catalog/separateQueryFromModifier.html), [Split Variable](https://refactoring.com/catalog/splitVariable.html) |
| **Dead Code** | [Remove Dead Code](https://refactoring.com/catalog/removeDeadCode.html) |
| **Shallow module** | [Inline Function](https://refactoring.com/catalog/inlineFunction.html), [Inline Class](https://refactoring.com/catalog/inlineClass.html), or deepen it (see [deep-modules.md](deep-modules.md)) |

Also look at the **existing code** the new code reveals as problematic.
