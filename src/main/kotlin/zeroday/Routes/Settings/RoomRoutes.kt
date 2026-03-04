package zeroday.Routes.Settings

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.auth.*
import io.ktor.http.*
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import zeroday.Controller.service.RoomQueryService
import zeroday.Models.dto.room.RoomBlockRequest
import zeroday.Models.dto.room.RoomRequest
import zeroday.Models.dto.room.RoomResponse
import zeroday.Queries.Settings.RoomBlockRepository
import zeroday.Queries.Settings.RoomRepository
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID
import kotlin.text.trim

fun Application.roomRoutes() {
    routing {
        authenticate("auth-jwt") {

            route("/rooms") {

                /**
                 * 3.4 → Active rooms (today / now)
                 */
                get("/active") {
                    val now = LocalTime.now()
                    val today = LocalDate.now().toString()

                    call.respond(
                        HttpStatusCode.OK,
                        RoomQueryService.activeRooms(today, now)
                    )
                }

                /**
                 * 3.5 → Free rooms right now
                 */
                get("/free") {
                    val now = LocalTime.now()
                    val today = LocalDate.now().toString()

                    call.respond(
                        HttpStatusCode.OK,
                        RoomQueryService.freeRooms(today, now)
                    )
                }
            }
        }
    }
}
fun Application.roomBlockRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("✅ RoomBlockRoutes LOADED")

            route("/settings/room-blocks") {
                post {
                    val req = call.receive<RoomBlockRequest>()


                    val roomId = UUID.fromString(req.roomId)
                    val start = LocalTime.parse(req.timeStart)
                    val end = LocalTime.parse(req.timeEnd)


                    if (end.isBefore(start) || start.plusHours(1).isAfter(end)) {
                        call.respond(HttpStatusCode.BadRequest, "Room block must be at least 1 hour")
                        return@post
                    }


                    if (RoomBlockRepository.hasConflict(roomId, req.dayOfWeek, start, end)) {
                        call.respond(HttpStatusCode.Conflict, "Room already blocked for this time")
                        return@post
                    }


                    RoomBlockRepository.create(roomId, req.dayOfWeek, start, end, req.type)
                    call.respond(HttpStatusCode.Created)
                }
            }
        }
    }
}
fun Application.roomManagementRoutes() {
    routing {
        route("/api/settings/rooms") {

            // List rooms (includes inactive as well, since the UI manages status)
            get {
                val rooms = RoomRepository.listAll().map {
                    RoomResponse(
                        id = it["id"] as String,
                        code = it["code"] as String,
                        floor = it["floor"] as String,
                        capacity = it["capacity"] as Int,
                        type = it["type"] as String,
                        status = it["status"] as String
                    )
                }
                call.respond(HttpStatusCode.OK, rooms)
            }

            // Create
            post {
                val req = call.receive<RoomRequest>()
                val active = (req.status ?: "Active").equals("Active", ignoreCase = true)
                val id = RoomRepository.create(
                    code = req.code.trim(),
                    floor = req.floor.trim(),
                    capacity = req.capacity,
                    type = req.type,
                    active = active
                )
                call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
            }

            // Update
            put("/{id}") {
                val id = UUID.fromString(call.parameters["id"])
                val req = call.receive<RoomRequest>()
                val active = (req.status ?: "Active").equals("Active", ignoreCase = true)

                RoomRepository.update(
                    id = id,
                    code = req.code.trim(),
                    floor = req.floor.trim(),
                    capacity = req.capacity,
                    type = req.type,
                    active = active
                )
                call.respond(HttpStatusCode.OK)
            }

            // "Delete" in UI maps to deactivation
            delete("/{id}") {
                val id = UUID.fromString(call.parameters["id"])
                RoomRepository.deactivate(id)
                call.respond(HttpStatusCode.OK)
            }
        }
    }
}
