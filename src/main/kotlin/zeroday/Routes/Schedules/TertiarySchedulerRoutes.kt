package zeroday.Routes.Schedules

import io.ktor.http.HttpStatusCode
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import zeroday.Controller.auth.requireRole
import zeroday.Controller.service.SchedulerSTI_Service
import zeroday.Models.dto.schedule.TertiaryCreateBlockRequest
import zeroday.Models.dto.schedule.UpdateScheduleRowRequest
import zeroday.Models.dto.schedule.DuplicateScheduleRowRequest
import zeroday.Queries.Schedules.SchedulerSTI_Repository
import zeroday.Queries.Settings.TeacherRepository
import java.util.UUID

fun Route.tertiarySchedulerRoutes() {

    authenticate("auth-jwt") {
        route("/api/scheduler/tertiary") {

            get("/blocks") {
                call.requireRole(setOf("ADMIN", "SUPER_ADMIN", "ACADEMIC_HEAD", "PROGRAM_HEAD", "SCHEDULER", "ASSISTANT_PRINCIPAL", "TEACHER", "CHECKER", "STAFF")) ?: return@get
                call.respond(SchedulerSTI_Repository.listBlocks())
            }

            post("/blocks") {
                val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN", "ACADEMIC_HEAD", "PROGRAM_HEAD", "SCHEDULER", "ASSISTANT_PRINCIPAL")) ?: return@post
                try {
                    val req = call.receive<TertiaryCreateBlockRequest>()
                    val curriculumId = try {
                        UUID.fromString(req.curriculumId)
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid curriculumId"))
                        return@post
                    }

                    if (!call.requireSchedulerWriteAccessForCourse(claims, req.courseCode, "TERTIARY_STI")) return@post

                    val section = SchedulerSTI_Service.createBlock(
                        courseCode = req.courseCode,
                        curriculumId = curriculumId,
                        year = req.year,
                        term = req.term
                    )

                    call.respond(HttpStatusCode.Created, mapOf("section" to section))
                } catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to (e.message ?: "Invalid request")))
                } catch (e: IllegalStateException) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to (e.message ?: "Cannot create block")))
                }
            }

            delete("/blocks/{sectionCode}") {
                val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN", "ACADEMIC_HEAD", "PROGRAM_HEAD", "SCHEDULER", "ASSISTANT_PRINCIPAL")) ?: return@delete
                val sectionCode = call.parameters["sectionCode"]
                if (sectionCode.isNullOrBlank()) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Missing sectionCode"))
                    return@delete
                }
                if (!call.requireSchedulerWriteAccessBySection(claims, sectionCode)) return@delete
                SchedulerSTI_Repository.deleteBlock(sectionCode)
                call.respond(HttpStatusCode.NoContent)
            }



            post("/rows") {
                val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN", "ACADEMIC_HEAD", "PROGRAM_HEAD", "SCHEDULER", "ASSISTANT_PRINCIPAL")) ?: return@post
                val req = call.receive<DuplicateScheduleRowRequest>()
                val baseId = try {
                    UUID.fromString(req.baseRowId)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid baseRowId"))
                    return@post
                }

                if (!call.requireSchedulerWriteAccessByRowId(claims, baseId)) return@post

                val newId = try {
                    SchedulerSTI_Repository.duplicateRow(baseId)
                } catch (e: IllegalArgumentException) {
                    call.respond(HttpStatusCode.NotFound, mapOf("message" to (e.message ?: "Base row not found")))
                    return@post
                }

                call.respond(HttpStatusCode.Created, mapOf("id" to newId.toString()))
            }

            delete("/rows/{id}") {
                val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN", "ACADEMIC_HEAD", "PROGRAM_HEAD", "SCHEDULER", "ASSISTANT_PRINCIPAL")) ?: return@delete
                val idStr = call.parameters["id"] ?: return@delete call.respond(
                    HttpStatusCode.BadRequest, mapOf("message" to "Missing id")
                )

                val id = try { UUID.fromString(idStr) } catch (_: Exception) {
                    return@delete call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid id"))
                }

                if (!call.requireSchedulerWriteAccessByRowId(claims, id)) return@delete

                val ok = SchedulerSTI_Repository.deleteDuplicateRow(id)
                if (!ok) {
                    return@delete call.respond(
                        HttpStatusCode.BadRequest,
                        mapOf("message" to "Cannot delete base row (only added rows can be deleted)")
                    )
                }

                call.respond(HttpStatusCode.NoContent)
            }

            put("/rows/{id}") {
                val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN", "ACADEMIC_HEAD", "PROGRAM_HEAD", "SCHEDULER", "ASSISTANT_PRINCIPAL")) ?: return@put
                val idParam = call.parameters["id"]
                val id = try { UUID.fromString(idParam) } catch (_: Exception) { null }

                if (id == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid schedule row id"))
                    return@put
                }

                if (!call.requireSchedulerWriteAccessByRowId(claims, id)) return@put

                val req = call.receive<UpdateScheduleRowRequest>()

                val roomId = req.roomId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                val teacherId = req.teacherId?.let { runCatching { UUID.fromString(it) }.getOrNull() }

                if (teacherId != null && !TeacherRepository.isInstructorAssignable(teacherId)) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Selected teacher role cannot be assigned as instructor."))
                    return@put
                }

                try {
                    SchedulerSTI_Repository.updateRow(
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
