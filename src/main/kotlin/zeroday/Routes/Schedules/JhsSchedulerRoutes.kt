package zeroday.Routes.Schedules

import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import zeroday.Controller.auth.requireRole
import zeroday.Models.dto.schedule.DuplicateScheduleRowRequest
import zeroday.Models.dto.schedule.JhsCreateBlockRequest
import zeroday.Models.dto.schedule.UpdateScheduleRowRequest
import zeroday.Queries.Schedules.SchedulerJHS_Repository
import zeroday.Queries.Settings.TeacherRepository
import java.util.UUID

fun Route.jhsSchedulerRoutes() {

    authenticate("auth-jwt") {
        route("/api/scheduler/jhs") {

            get("/blocks") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN", "TEACHER", "CHECKER", "NON_TEACHING")) ?: return@get
                call.respond(SchedulerJHS_Repository.listBlocks())
            }

            post("/blocks") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@post
                val req = call.receive<JhsCreateBlockRequest>()

                val curriculumId = try {
                    UUID.fromString(req.curriculumId)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid curriculumId"))
                    return@post
                }

                try {
                    SchedulerJHS_Repository.createBlock(
                        curriculumId = curriculumId,
                        grade = req.grade,
                        sectionName = req.sectionName
                    )
                    call.respond(HttpStatusCode.Created)
                } catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to (e.message ?: "Invalid request")))
                } catch (e: IllegalStateException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to (e.message ?: "Cannot create block")))
                }
            }

            delete("/blocks/{section}") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@delete
                val section = call.parameters["section"]
                if (section.isNullOrBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Missing section"))
                    return@delete
                }
                SchedulerJHS_Repository.deleteBlock(section)
                call.respond(HttpStatusCode.NoContent)
            }

            post("/rows") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@post
                val req = call.receive<DuplicateScheduleRowRequest>()
                val baseId = try {
                    UUID.fromString(req.baseRowId)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid baseRowId"))
                    return@post
                }

                val newId = try {
                    SchedulerJHS_Repository.duplicateRow(baseId)
                } catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.NotFound, mapOf("message" to (e.message ?: "Base row not found")))
                    return@post
                }

                call.respond(HttpStatusCode.Created, mapOf("id" to newId.toString()))
            }

            delete("/rows/{id}") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@delete
                val idStr = call.parameters["id"] ?: return@delete call.respond(
                    HttpStatusCode.BadRequest,
                    mapOf("message" to "Missing id")
                )

                val id = try {
                    UUID.fromString(idStr)
                } catch (_: Exception) {
                    return@delete call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid id"))
                }

                val ok = SchedulerJHS_Repository.deleteDuplicateRow(id)
                if (!ok) {
                    return@delete call.respond(
                        HttpStatusCode.BadRequest,
                        mapOf("message" to "Cannot delete base row (only added rows can be deleted)")
                    )
                }

                call.respond(HttpStatusCode.NoContent)
            }

            put("/rows/{id}") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@put
                val idStr = call.parameters["id"] ?: return@put call.respond(
                    HttpStatusCode.BadRequest,
                    mapOf("message" to "Missing id")
                )

                val id = try {
                    UUID.fromString(idStr)
                } catch (_: Exception) {
                    return@put call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid id"))
                }

                val req = call.receive<UpdateScheduleRowRequest>()
                val roomId = req.roomId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                val teacherId = req.teacherId?.let { runCatching { UUID.fromString(it) }.getOrNull() }

                if (teacherId != null && !TeacherRepository.isInstructorAssignable(teacherId)) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Selected teacher role cannot be assigned as instructor."))
                    return@put
                }

                try {
                    SchedulerJHS_Repository.updateRow(
                        id = id,
                        day = req.day,
                        start = req.startTime,
                        end = req.endTime,
                        roomId = roomId,
                        teacherId = teacherId
                    )
                    call.respond(HttpStatusCode.OK)
                } catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to (e.message ?: "Invalid schedule time")))
                }
            }
        }
    }
}
