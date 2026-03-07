package zeroday.Routes.Dashboard

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import zeroday.Controller.auth.requireRole
import zeroday.Controller.service.DashboardService
import zeroday.Controller.service.LiveScheduleService

fun Application.dashboardRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("DashboardRoutes LOADED")
            get("/dashboard/summary") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                call.respond(DashboardService.summary())
            }

            get("/dashboard/rooms") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                val day = call.request.queryParameters["day"]?.trim()?.uppercase()
                    ?: java.time.LocalDate.now().dayOfWeek.name
                call.respond(DashboardService.roomOverview(day))
            }

            get("/dashboard/incomplete") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                val limit = call.request.queryParameters["limit"]?.toIntOrNull()?.coerceIn(1, 500) ?: 200
                call.respond(DashboardService.incomplete(limit))
            }

            get("/dashboard/live") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                call.respond(LiveScheduleService.fetch())
            }
        }
    }
}
