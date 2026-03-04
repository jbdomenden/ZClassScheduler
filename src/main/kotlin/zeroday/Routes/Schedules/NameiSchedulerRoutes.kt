
package zeroday.Routes.Schedules

import io.ktor.http.HttpStatusCode
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import zeroday.Controller.service.SchedulerNAMEI_Service
import zeroday.Models.dto.schedule.TertiaryCreateBlockRequest
import zeroday.Models.dto.schedule.DuplicateScheduleRowRequest
import zeroday.Models.dto.schedule.UpdateScheduleRowRequest
import zeroday.Queries.Schedules.SchedulerNAMEI_Repository
import java.util.UUID

fun Route.nameiSchedulerRoutes() {

    route("/api/scheduler/namei") {

        get("/blocks") {
            call.respond(SchedulerNAMEI_Repository.listBlocks())
        }

        post("/blocks") {
            try {
                val req = call.receive<TertiaryCreateBlockRequest>()
                val curriculumId = try {
                    UUID.fromString(req.curriculumId)
                } catch (_: Exception) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid curriculumId"))
                    return@post
                }

                val section = SchedulerNAMEI_Service.createBlock(
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
            val sectionCode = call.parameters["sectionCode"]
            if (sectionCode.isNullOrBlank()) {
                call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Missing sectionCode"))
                return@delete
            }
            SchedulerNAMEI_Repository.deleteBlock(sectionCode)
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
                SchedulerNAMEI_Repository.duplicateRow(baseId)
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

            val ok = SchedulerNAMEI_Repository.deleteDuplicateRow(id)
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

            SchedulerNAMEI_Repository.updateRow(
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
