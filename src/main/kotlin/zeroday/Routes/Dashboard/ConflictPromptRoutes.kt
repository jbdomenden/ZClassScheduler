package zeroday.Routes.Dashboard


import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import zeroday.Controller.service.DashboardConflictService

fun Application.conflictPromptRoutes() {
    routing {
        authenticate("auth-jwt") {
            get("/dashboard/conflicts") {
                call.respond(
                    DashboardConflictService.latestConflicts()
                )
            }
        }
    }
}
