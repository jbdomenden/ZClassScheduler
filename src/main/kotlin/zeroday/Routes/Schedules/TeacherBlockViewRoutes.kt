package zeroday.Routes.Schedules

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.*
import io.ktor.server.auth.authenticate
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import zeroday.Controller.auth.requireRole
import zeroday.Models.dto.teacher.TeacherBlockResponse
import zeroday.Queries.Schedules.TeacherBlockRepository
import java.util.UUID

fun Application.teacherBlockViewRoutes() {
    routing {
        authenticate("auth-jwt") {
            get("/api/schedules/teacher-blocks") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN", "ACADEMIC_HEAD", "PROGRAM_HEAD", "SCHEDULER", "ASSISTANT_PRINCIPAL", "TEACHER", "CHECKER", "STAFF")) ?: return@get

                val teacherIdRaw = call.request.queryParameters["teacherId"]?.trim()
                if (teacherIdRaw.isNullOrBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "teacherId is required"))
                    return@get
                }
                val teacherId = runCatching { UUID.fromString(teacherIdRaw) }.getOrNull()
                if (teacherId == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid teacherId"))
                    return@get
                }

                val rows = TeacherBlockRepository.listByTeacher(teacherId)
                val out = rows.map {
                    TeacherBlockResponse(
                        id = it["id"] as String,
                        teacherId = it["teacherId"] as String,
                        type = it["type"] as String,
                        dayOfWeek = it["dayOfWeek"] as String,
                        timeStart = it["timeStart"] as String,
                        timeEnd = it["timeEnd"] as String,
                    )
                }
                call.respond(HttpStatusCode.OK, out)
            }
        }
    }
}

