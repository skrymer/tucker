package com.tucker

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class TuckerApplication

@Suppress("SpreadOperator") // the spread is the idiomatic Spring Boot entrypoint
fun main(args: Array<String>) {
    runApplication<TuckerApplication>(*args)
}
