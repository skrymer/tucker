package com.tucker.domain

/**
 * A drink's alcohol as its label states it, in percent by volume. How alcohol is
 * written and read, never how it is kept: a Food stores grams per 100 g (ADR 0040).
 */
@JvmInline
value class AlcoholByVolume(val percent: Double) {
    init {
        require(percent >= 0) { "ABV must be >= 0, was $percent" }
        require(percent <= MAX_PERCENT) { "ABV must be <= 100, was $percent" }
    }

    /** Grams of alcohol per 100 g of the drink. */
    val gramsPer100g: Double get() = percent * ETHANOL_GRAMS_PER_ML

    companion object {
        private const val MAX_PERCENT = 100.0

        /** Ethanol's density; the drink itself is taken as 1 g/ml. */
        private const val ETHANOL_GRAMS_PER_ML = 0.789

        /** Six decimals is far past any label and far above the division's float noise. */
        private const val ABV_DECIMALS = 1e6

        /**
         * The ABV a stored grams-per-100 g figure was written as, rounded off the float
         * noise of the division so a 13% wine reopens as 13, not 12.999999999999998.
         */
        fun ofGramsPer100g(gramsPer100g: Double) =
            AlcoholByVolume(Math.round(gramsPer100g / ETHANOL_GRAMS_PER_ML * ABV_DECIMALS) / ABV_DECIMALS)
    }
}
