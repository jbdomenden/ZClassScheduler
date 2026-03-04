package zeroday.Routes.Dashboard

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import zeroday.Controller.service.RoomUtilizationService

fun Application.roomUtilizationRoutes() {

    routing {
        authenticate("auth-jwt") {

            get("/dashboard/rooms/utilization") {
                call.respond(
                    RoomUtilizationService.calculate()
                )
            }
        }
    }
}
