package zeroday.Routes.Dashboard

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import zeroday.Controller.auth.requireRole
import zeroday.Controller.service.RoomUtilizationService
import java.time.LocalDate

fun Application.roomUtilizationRoutes() {

    routing {
        authenticate("auth-jwt") {

            get("/dashboard/rooms/utilization") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                val day = call.request.queryParameters["day"]?.trim()?.uppercase()
                    ?: LocalDate.now().dayOfWeek.name
                call.respond(
                    RoomUtilizationService.calculate(day)
                )
            }

            get("/dashboard/rooms/utilization/week") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                call.respond(RoomUtilizationService.calculateWeek())
            }

            get("/dashboard/rooms/utilization/week-grid") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                call.respond(RoomUtilizationService.calculateWeekGrid())
            }
        }
    }
}
