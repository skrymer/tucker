package com.tucker

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class TuckerApplication

fun main(args: Array<String>) {
    runApplication<TuckerApplication>(*args)
}
