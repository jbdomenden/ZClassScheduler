package zeroday.Routes.Dashboard

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import zeroday.Controller.service.ActiveScheduleService

fun Application.activeStatusRoutes() {
    routing {
        authenticate("auth-jwt") {

            get("/dashboard/active") {
                call.respond(
                    mapOf(
                        "rooms" to ActiveScheduleService.getActiveRooms(),
                        "teachers" to ActiveScheduleService.getActiveTeachers(),
                        "sections" to ActiveScheduleService.getActiveSections()
                    )
                )
            }
        }
    }
}
