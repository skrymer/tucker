package com.tucker.api

import com.tucker.domain.Food
import com.tucker.domain.Macros
import com.tucker.persistence.FoodRepository
import com.tucker.security.WithTuckerUser
import org.hamcrest.Matchers.closeTo
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.transaction.annotation.Transactional

/** Reading back a stored alcohol figure, which no request can put out of a drink's range. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithTuckerUser
class FoodAlcoholApiTest {

    @Autowired lateinit var mockMvc: MockMvc
    @Autowired lateinit var foods: FoodRepository

    @Test
    fun `a Food holding more alcohol than any drink reads back, its ABV past 100`() {
        // A Recipe conserves its alcohol (ADR 0040): a bottle of 13% wine's 77 g cooked down to 50 g.
        val nutrition = Macros(0.0, 0.0, 0.0, alcoholPer100g = 154.0).nutrition()
        val reduction = foods.insert(Food.plain(foods.nextId(), "Wine reduction", null, nutrition))

        mockMvc.get("/api/foods/${reduction.id}").andExpect {
            status { isOk() }
            jsonPath("$.alcoholPer100g") { value(154.0) }
            jsonPath("$.alcoholAbv", closeTo(195.183777, 1e-9))
        }
    }
}
