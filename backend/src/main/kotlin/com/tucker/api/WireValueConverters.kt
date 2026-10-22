package com.tucker.api

import com.tucker.domain.BrowserEngine
import com.tucker.domain.MetricRange
import org.springframework.context.annotation.Configuration
import org.springframework.format.FormatterRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer

/** Binds a request parameter by the wire name its type is spelled with everywhere else. */
@Configuration
class WireValueConverters : WebMvcConfigurer {
    override fun addFormatters(registry: FormatterRegistry) {
        registry.addConverter(String::class.java, MetricRange::class.java, MetricRange::of)
        registry.addConverter(String::class.java, BrowserEngine::class.java, BrowserEngine::of)
    }
}
