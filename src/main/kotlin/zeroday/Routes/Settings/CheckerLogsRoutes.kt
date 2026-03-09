package zeroday.Routes.Settings

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.*
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import zeroday.Controller.auth.requireRole
import zeroday.Models.dto.checker.CheckerReportRequest
import zeroday.Models.dto.checker.CheckerLogListResponse
import zeroday.Queries.Settings.CheckerLogsQueryRepository
import zeroday.Queries.Settings.TeacherRepository
import java.util.UUID

fun Application.checkerLogsRoutes() {
    routing {
        authenticate("auth-jwt") {

            // Checker report submission (used by SchedulesRoom when role=CHECKER).
            post("/api/checker/reports") {
                val claims = call.requireRole(setOf("CHECKER", "ADMIN", "SUPER_ADMIN")) ?: return@post

                val req = call.receive<CheckerReportRequest>()
                val scheduleId = runCatching { UUID.fromString(req.scheduleId.trim()) }.getOrNull()
                if (scheduleId == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid scheduleId"))
                    return@post
                }

                val rawStatus = req.status
                    ?: req.present?.let { if (it) "PRESENT" else "ABSENT" }
                val status = rawStatus
                    ?.trim()
                    ?.uppercase()
                    ?.replace(" ", "_")
                    ?.replace("-", "_")
                if (status == null || status.isEmpty()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Status is required."))
                    return@post
                }
                if (status !in setOf("PRESENT", "ABSENT", "NOT_IN_CLASS")) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid status. Use PRESENT, ABSENT, or NOT_IN_CLASS."))
                    return@post
                }

                val present = status == "PRESENT"
                val id = try {
                    CheckerLogsQueryRepository.createFromSchedule(
                        scheduleId = scheduleId,
                        checkerUserKey = claims.userKey,
                        checkerEmail = claims.email,
                        status = status,
                        present = present,
                        note = req.note
                    )
                } catch (e: IllegalStateException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to (e.message ?: "Invalid schedule")))
                    return@post
                } catch (e: Exception) {
                    call.application.log.error("Checker report failed", e)
                    call.respond(HttpStatusCode.InternalServerError, mapOf("message" to "Failed to submit report"))
                    return@post
                }

                call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
            }

            // Checker logs list
            route("/api/settings/checker-logs") {
                get {
                    val claims = call.requireRole(setOf("CHECKER", "ADMIN", "SUPER_ADMIN")) ?: return@get

                    val limit = call.request.queryParameters["limit"]?.toIntOrNull() ?: 200
                    val offset = call.request.queryParameters["offset"]?.toLongOrNull() ?: 0L

                    val status = call.request.queryParameters["status"]?.trim()?.uppercase()?.replace(" ", "_")?.replace("-", "_")?.takeIf { it.isNotEmpty() }
                    val present = call.request.queryParameters["present"]?.lowercase()?.let {
                        when (it) {
                            "true", "1", "yes" -> true
                            "false", "0", "no" -> false
                            else -> null
                        }
                    }
                    val q = call.request.queryParameters["q"]

                    val onlyCheckerUserKey = if (claims.role == "CHECKER") claims.userKey else null

                    val allowedDepts = if (claims.role == "ADMIN") {
                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@get
                        }
                        TeacherRepository.findDepartmentsByEmail(actorEmail)
                    } else {
                        null
                    }

                    if (claims.role == "ADMIN" && (allowedDepts == null || allowedDepts.isEmpty())) {
                        // Admins can only see logs scoped to their department(s); if none, show none.
                        call.respond(
                            HttpStatusCode.OK,
                            CheckerLogListResponse(items = emptyList(), limit = limit.coerceIn(1, 500), offset = offset.coerceAtLeast(0), nextOffset = null)
                        )
                        return@get
                    }

                    val out = CheckerLogsQueryRepository.list(
                        limit = limit,
                        offset = offset,
                        q = q,
                        status = status,
                        present = present,
                        checkerUserKey = onlyCheckerUserKey,
                        allowedTeacherDepartments = allowedDepts
                    )

                    call.respond(HttpStatusCode.OK, out)
                }
            }
        }
    }
}
