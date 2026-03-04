
package zeroday.Routes.Schedules

import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import zeroday.Controller.service.SchedulerSHS_Service
import zeroday.Models.dto.schedule.ShsCreateBlockRequest
import zeroday.Models.dto.schedule.DuplicateScheduleRowRequest
import zeroday.Models.dto.schedule.UpdateScheduleRowRequest
import zeroday.Queries.Schedules.SchedulerSHS_Repository
import java.util.UUID

fun Route.shsSchedulerRoutes() {

    route("/api/scheduler/shs") {

        get("/blocks") {
            call.respond(SchedulerSHS_Repository.listBlocks())
        }

        post("/blocks") {
            try {
                val req = call.receive<ShsCreateBlockRequest>()
                val curriculumId = try {
                    UUID.fromString(req.curriculumId)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid curriculumId"))
                    return@post
                }

                val section = SchedulerSHS_Service.createBlock(
                    courseCode = req.courseCode,
                    curriculumId = curriculumId,
                    grade = req.grade,
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
            val sectionCode = call.parameters["sectionCode"]
            if (sectionCode.isNullOrBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Missing sectionCode"))
                return@delete
            }
            SchedulerSHS_Repository.deleteBlock(sectionCode)
            call.respond(HttpStatusCode.NoContent)
        }

        post("/rows") {
            val req = call.receive<DuplicateScheduleRowRequest>()
            val baseId = try {
                UUID.fromString(req.baseRowId)
            } catch (_: Exception) {
                call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid baseRowId"))
                return@post
            }

            val newId = try {
                SchedulerSHS_Repository.duplicateRow(baseId)
            } catch (e: IllegalArgumentException) {
                call.respond(HttpStatusCode.NotFound, mapOf("message" to (e.message ?: "Base row not found")))
                return@post
            }

            call.respond(HttpStatusCode.Created, mapOf("id" to newId.toString()))
        }

        delete("/rows/{id}") {
            val idStr = call.parameters["id"] ?: return@delete call.respond(
                HttpStatusCode.BadRequest, mapOf("message" to "Missing id")
            )

            val id = try { UUID.fromString(idStr) } catch (_: Exception) {
                return@delete call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid id"))
            }

            val ok = SchedulerSHS_Repository.deleteDuplicateRow(id)
            if (!ok) {
                return@delete call.respond(
                    HttpStatusCode.BadRequest,
                    mapOf("message" to "Cannot delete base row (only added rows can be deleted)")
                )
            }

            call.respond(HttpStatusCode.NoContent)
        }

        put("/rows/{id}") {
            val idParam = call.parameters["id"]
            val id = try { UUID.fromString(idParam) } catch (_: Exception) { null }

            if (id == null) {
                call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid schedule row id"))
                return@put
            }

            val req = call.receive<UpdateScheduleRowRequest>()

            val roomId = req.roomId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
            val teacherId = req.teacherId?.let { runCatching { UUID.fromString(it) }.getOrNull() }

            SchedulerSHS_Repository.updateRow(
                id = id,
                day = req.day,
                start = req.startTime,
                end = req.endTime,
                roomId = roomId,
                teacherId = teacherId
            )

            call.respond(HttpStatusCode.OK)
        }
    }
}
