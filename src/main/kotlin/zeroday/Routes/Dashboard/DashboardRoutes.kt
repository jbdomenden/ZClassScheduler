package zeroday.Routes.Dashboard

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import zeroday.Controller.service.DashboardService

fun Application.dashboardRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("✅ DashboardRoutes LOADED")
            get("/dashboard/summary") {
                call.respond(DashboardService.summary())
            }
        }
    }
}
