package zeroday.Routes.Dashboard


import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import zeroday.Controller.auth.requireRole
import zeroday.Controller.service.DashboardConflictService

fun Application.conflictPromptRoutes() {
    routing {
        authenticate("auth-jwt") {
            get("/dashboard/conflicts") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 2000) ?: 500
                call.respond(
                    DashboardConflictService.scheduleConflicts(limit)
                )
            }
        }
    }
}
