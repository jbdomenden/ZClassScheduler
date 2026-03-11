package zeroday.Routes.Settings

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.auth.authenticate
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import zeroday.Controller.auth.requireRole
import zeroday.Queries.Settings.ScheduleLogsRepository

fun Application.scheduleLogsRoutes() {
    routing {
        authenticate("auth-jwt") {
            route("/api/logs/schedule") {
                get {
                    call.requireRole(setOf("ACADEMIC_HEAD", "PROGRAM_HEAD", "SCHEDULER", "ASSISTANT_PRINCIPAL", "ADMIN", "SUPER_ADMIN"))
                        ?: return@get

                    val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 200
                    val offset = call.request.queryParameters["offset"]?.toLongOrNull() ?: 0L
                    val search = call.request.queryParameters["search"] ?: call.request.queryParameters["q"]
                    val action = call.request.queryParameters["action"]

                    val out = ScheduleLogsRepository.list(limit = limit, offset = offset, search = search, action = action)
                    call.respond(HttpStatusCode.OK, out)
                }
            }
        }
    }
}
