package zeroday.Routes.Settings

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import zeroday.Controller.auth.requireRole
import zeroday.Queries.Settings.AuditLogsQueryRepository

fun Application.auditLogsRoutes() {
    routing {
        authenticate("auth-jwt") {
            route("/api/settings/audit-logs") {
                get {
                    // SUPER_ADMIN only
                    val claims = call.requireRole(setOf("SUPER_ADMIN")) ?: return@get

                    val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 200
                    val offset = call.request.queryParameters["offset"]?.toLongOrNull() ?: 0L

                    val role = call.request.queryParameters["role"]
                    val entity = call.request.queryParameters["entity"]
                    val action = call.request.queryParameters["action"]
                    val success = call.request.queryParameters["success"]?.lowercase()?.let {
                        when (it) {
                            "true", "1", "yes" -> true
                            "false", "0", "no" -> false
                            else -> null
                        }
                    }
                    val q = call.request.queryParameters["q"]

                    val out = AuditLogsQueryRepository.list(
                        limit = limit,
                        offset = offset,
                        role = role,
                        entity = entity,
                        action = action,
                        success = success,
                        q = q,
                        privilegedOnly = true,
                    )

                    call.respond(HttpStatusCode.OK, out)
                }
            }
        }
    }
}

