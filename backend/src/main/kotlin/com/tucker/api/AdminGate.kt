package com.tucker.api

import com.tucker.security.CurrentUser
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.stereotype.Component
import org.springframework.web.servlet.HandlerInterceptor
import org.springframework.web.servlet.config.annotation.InterceptorRegistry
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer
import org.springframework.web.servlet.resource.NoResourceFoundException

/**
 * Answers anyone but an Admin under `/api/admin` as Spring answers a path with nothing
 * behind it (ADR 0039), so the status says nothing about there being a page here they
 * may not see. It runs before a handler reads its parameters, which would otherwise
 * refuse an unreadable one first.
 */
@Component
class AdminGate(private val currentUser: CurrentUser) : HandlerInterceptor {

    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        if (!currentUser.admin) {
            throw NoResourceFoundException(HttpMethod.valueOf(request.method), request.requestURI.removePrefix("/"))
        }
        return true
    }
}

@Configuration
class AdminGateConfig(private val gate: AdminGate) : WebMvcConfigurer {
    override fun addInterceptors(registry: InterceptorRegistry) {
        registry.addInterceptor(gate).addPathPatterns("/api/admin/**")
    }
}
