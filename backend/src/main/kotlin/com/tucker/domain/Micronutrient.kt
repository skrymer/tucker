package com.tucker.domain

/**
 * A vitamin or mineral Tucker reads a window of food against (ADR 0027) — the
 * nineteen the Australian Food Composition Database populates for every one of its
 * foods, which is what makes a fallback source unnecessary.
 *
 * Energy and the macros are absent deliberately, protein most of all: it already
 * has a **Protein Floor** set from body weight, and the published reference for it
 * is a quite different and much lower figure. Dietary fibre is the one member that
 * is not strictly a micronutrient, and is here because AFCD reports it alongside
 * them and the NHMRC publishes a reference for it.
 *
 * [unit] is the unit AFCD reports the amount in, per 100 g.
 */
enum class Micronutrient(val label: String, val unit: String) {
    FIBRE("Dietary fibre", "g"),
    CALCIUM("Calcium", "mg"),
    IODINE("Iodine", "µg"),
    IRON("Iron", "mg"),
    MAGNESIUM("Magnesium", "mg"),
    POTASSIUM("Potassium", "mg"),
    SELENIUM("Selenium", "µg"),
    SODIUM("Sodium", "mg"),
    ZINC("Zinc", "mg"),
    VITAMIN_A("Vitamin A", "µg"),
    THIAMIN("Thiamin", "mg"),
    RIBOFLAVIN("Riboflavin", "mg"),
    NIACIN("Niacin", "mg"),
    VITAMIN_B6("Vitamin B6", "mg"),
    VITAMIN_B12("Vitamin B12", "µg"),
    FOLATE("Folate", "µg"),
    VITAMIN_C("Vitamin C", "mg"),
    VITAMIN_D("Vitamin D", "µg"),
    VITAMIN_E("Vitamin E", "mg"),
}
