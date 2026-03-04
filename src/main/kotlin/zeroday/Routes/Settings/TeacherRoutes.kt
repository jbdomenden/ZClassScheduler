package zeroday.Routes.Settings

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.http.*
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import org.jetbrains.exposed.exceptions.ExposedSQLException
import zeroday.Controller.service.TeacherAvailabilityService
import zeroday.Models.db.tables.TeacherBlockType
import zeroday.Models.dto.teacher.TeacherBlockRequest
import zeroday.Models.dto.teacher.TeacherRequest
import zeroday.Models.dto.teacher.TeacherResponse
import zeroday.Queries.Schedules.TeacherBlockRepository
import zeroday.Queries.Settings.TeacherRepository
import java.time.LocalTime
import java.util.UUID

fun Application.teacherRoutes() {
    routing {
        route("/teachers") {
            get("/free/now") {
                val teachers = TeacherAvailabilityService.getFreeTeachersNow()
                call.respond(HttpStatusCode.OK, teachers)
            }
        }
    }
}
fun Application.teacherManagementRoutes() {
    routing {
        route("/api/settings/teachers") {

            get {
                val teachers = TeacherRepository.listAll().map {
                    TeacherResponse(
                        id = it["id"] as String,
                        empId = (it["empId"] as String?) ?: "",
                        firstName = it["firstName"] as String,
                        lastName = it["lastName"] as String,
                        department = it["department"] as String,
                        email = it["email"] as String,
                        role = (it["role"] as String?) ?: "Teacher",
                        status = it["status"] as String
                    )
                }
                call.respond(HttpStatusCode.OK, teachers)
            }

            post {
                try {
                    val req = call.receive<TeacherRequest>()
                    val active = (req.status ?: "Active").equals("Active", ignoreCase = true)

                    if (req.password.trim().isEmpty()) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Password is required."))
                        return@post
                    }

                    if (TeacherRepository.existsEmpId(req.empId.trim())) {
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Employee ID must be unique."))
                        return@post
                    }
                    if (TeacherRepository.existsEmail(req.email.trim())) {
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Email must be unique."))
                        return@post
                    }

                    val id = TeacherRepository.createWithLogin(
                        empId = req.empId.trim(),
                        firstName = req.firstName.trim(),
                        lastName = req.lastName.trim(),
                        department = req.department.trim(),
                        email = req.email.trim(),
                        passwordPlain = req.password,
                        role = req.role,
                        active = active
                    )

                    call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                } catch (e: ExposedSQLException) {
                    call.application.log.error("Teacher create failed", e)
                    call.respond(HttpStatusCode.Conflict, mapOf("message" to "Duplicate teacher (empId or email)."))
                } catch (e: IllegalStateException) {
                    call.respond(HttpStatusCode.Conflict, mapOf("message" to (e.message ?: "Conflict")))
                }
            }

            put("/{id}") {
                try {
                    val id = UUID.fromString(call.parameters["id"])
                    val req = call.receive<TeacherRequest>()
                    val active = (req.status ?: "Active").equals("Active", ignoreCase = true)

                    if (TeacherRepository.existsEmpId(req.empId.trim(), excludeId = id)) {
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Employee ID must be unique."))
                        return@put
                    }
                    if (TeacherRepository.existsEmail(req.email.trim(), excludeId = id)) {
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Email must be unique."))
                        return@put
                    }

                    TeacherRepository.updateWithLogin(
                        id = id,
                        empId = req.empId.trim(),
                        firstName = req.firstName.trim(),
                        lastName = req.lastName.trim(),
                        department = req.department.trim(),
                        emailInput = req.email.trim(),
                        passwordPlain = req.password, // may be empty: keeps existing login password
                        role = req.role,
                        active = active
                    )

                    call.respond(HttpStatusCode.OK)
                } catch (e: ExposedSQLException) {
                    call.application.log.error("Teacher update failed", e)
                    call.respond(HttpStatusCode.Conflict, mapOf("message" to "Duplicate teacher (empId or email)."))
                } catch (e: IllegalStateException) {
                    call.respond(HttpStatusCode.Conflict, mapOf("message" to (e.message ?: "Conflict")))
                }
            }

            delete("/{id}") {
                val id = UUID.fromString(call.parameters["id"])
                TeacherRepository.deactivate(id)
                call.respond(HttpStatusCode.OK)
            }
        }
    }
}
fun Application.teacherBlockRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("✅ TeacherBlockRoutes LOADED")

            route("/settings/teacher-blocks") {


                post {
                    val req = call.receive<TeacherBlockRequest>()


                    val teacherId = UUID.fromString(req.teacherId)
                    val start = LocalTime.parse(req.timeStart)
                    val end = LocalTime.parse(req.timeEnd)


                    if (TeacherBlockRepository.hasOverlap(teacherId, req.dayOfWeek, start, end)) {
                        call.respond(HttpStatusCode.Conflict, mapOf(
                            "error" to "Teacher already has a block in this time"
                        ))
                        return@post
                    }


                    TeacherBlockRepository.create(
                        teacherId,
                        TeacherBlockType.valueOf(req.type),
                        req.dayOfWeek,
                        start,
                        end
                    )


                    call.respond(HttpStatusCode.Created)
                }
            }
        }
    }
}