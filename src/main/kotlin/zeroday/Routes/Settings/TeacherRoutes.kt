package zeroday.Routes.Settings

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.http.*
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import org.jetbrains.exposed.exceptions.ExposedSQLException
import zeroday.Controller.audit.auditPrivilegedCrud
import zeroday.Controller.auth.requireRole
import zeroday.Controller.service.TeacherAvailabilityService
import zeroday.Models.db.tables.TeacherBlockType
import zeroday.Models.dto.teacher.TeacherBlockRequest
import zeroday.Models.dto.teacher.TeacherBlockResponse
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
        authenticate("auth-jwt") {
            route("/api/settings/teachers") {

                // List is used by schedulers and dashboards: any authenticated role can read.
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

                // Create (ADMIN/SUPER_ADMIN). Only SUPER_ADMIN can create SUPER_ADMIN users.
                post {
                    val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@post
                    val req = call.receive<TeacherRequest>()
                    val requestedRole = (req.role ?: "TEACHER").trim().uppercase()
                    if (requestedRole == "SUPER_ADMIN" && claims.role != "SUPER_ADMIN") {
                        call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Only SUPER_ADMIN can assign SUPER_ADMIN role."))
                        return@post
                    }

                    try {
                        val active = (req.status ?: "Active").equals("Active", ignoreCase = true)

                        if (req.password.trim().isEmpty()) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Password is required."))
                            call.auditPrivilegedCrud("TEACHER_CREATE", "Teacher", null, success = false, message = "Could not create teacher: missing password.")
                            return@post
                        }

                        if (TeacherRepository.existsEmpId(req.empId.trim())) {
                            call.respond(HttpStatusCode.Conflict, mapOf("message" to "Employee ID must be unique."))
                            call.auditPrivilegedCrud("TEACHER_CREATE", "Teacher", null, success = false, message = "Could not create teacher: duplicate Employee ID.")
                            return@post
                        }
                        if (TeacherRepository.existsEmail(req.email.trim())) {
                            call.respond(HttpStatusCode.Conflict, mapOf("message" to "Email must be unique."))
                            call.auditPrivilegedCrud("TEACHER_CREATE", "Teacher", null, success = false, message = "Could not create teacher: duplicate email.")
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

                        call.auditPrivilegedCrud(
                            action = "TEACHER_CREATE",
                            entity = "Teacher",
                            entityId = id,
                            success = true,
                            message = "Created teacher '${req.firstName.trim()} ${req.lastName.trim()}' (${req.email.trim()}). Role: $requestedRole."
                        )
                        call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                    } catch (e: ExposedSQLException) {
                        call.application.log.error("Teacher create failed", e)
                        call.auditPrivilegedCrud("TEACHER_CREATE", "Teacher", null, success = false, message = "Could not create teacher: Employee ID or email already exists.")
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Duplicate teacher (empId or email)."))
                    } catch (e: IllegalStateException) {
                        call.auditPrivilegedCrud("TEACHER_CREATE", "Teacher", null, success = false, message = "Could not create teacher.")
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to (e.message ?: "Conflict")))
                    } catch (e: Exception) {
                        call.auditPrivilegedCrud("TEACHER_CREATE", "Teacher", null, success = false, message = "Could not create teacher.")
                        call.respond(HttpStatusCode.InternalServerError, mapOf("message" to "Teacher create failed"))
                    }
                }

                // Update (ADMIN/SUPER_ADMIN). Only SUPER_ADMIN can assign SUPER_ADMIN role.
                put("/{id}") {
                    val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@put
                    val id = UUID.fromString(call.parameters["id"])
                    val req = call.receive<TeacherRequest>()
                    val requestedRole = (req.role ?: "TEACHER").trim().uppercase()
                    if (requestedRole == "SUPER_ADMIN" && claims.role != "SUPER_ADMIN") {
                        call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Only SUPER_ADMIN can assign SUPER_ADMIN role."))
                        return@put
                    }

                    try {
                        val active = (req.status ?: "Active").equals("Active", ignoreCase = true)

                        if (TeacherRepository.existsEmpId(req.empId.trim(), excludeId = id)) {
                            call.respond(HttpStatusCode.Conflict, mapOf("message" to "Employee ID must be unique."))
                            call.auditPrivilegedCrud("TEACHER_UPDATE", "Teacher", id, success = false, message = "Could not update teacher: duplicate Employee ID.")
                            return@put
                        }
                        if (TeacherRepository.existsEmail(req.email.trim(), excludeId = id)) {
                            call.respond(HttpStatusCode.Conflict, mapOf("message" to "Email must be unique."))
                            call.auditPrivilegedCrud("TEACHER_UPDATE", "Teacher", id, success = false, message = "Could not update teacher: duplicate email.")
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

                        call.auditPrivilegedCrud(
                            action = "TEACHER_UPDATE",
                            entity = "Teacher",
                            entityId = id,
                            success = true,
                            message = "Updated teacher '${req.firstName.trim()} ${req.lastName.trim()}' (${req.email.trim()}). Role: $requestedRole."
                        )
                        call.respond(HttpStatusCode.OK)
                    } catch (e: ExposedSQLException) {
                        call.application.log.error("Teacher update failed", e)
                        call.auditPrivilegedCrud("TEACHER_UPDATE", "Teacher", id, success = false, message = "Could not update teacher: Employee ID or email already exists.")
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Duplicate teacher (empId or email)."))
                    } catch (e: IllegalStateException) {
                        call.auditPrivilegedCrud("TEACHER_UPDATE", "Teacher", id, success = false, message = "Could not update teacher.")
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to (e.message ?: "Conflict")))
                    } catch (e: Exception) {
                        call.auditPrivilegedCrud("TEACHER_UPDATE", "Teacher", id, success = false, message = "Could not update teacher.")
                        call.respond(HttpStatusCode.InternalServerError, mapOf("message" to "Teacher update failed"))
                    }
                }

                // Delete -> deactivate (ADMIN/SUPER_ADMIN)
                delete("/{id}") {
                    call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@delete
                    val id = UUID.fromString(call.parameters["id"])
                    try {
                        TeacherRepository.deactivate(id)
                        call.auditPrivilegedCrud("TEACHER_DEACTIVATE", "Teacher", id, success = true, message = null)
                        call.respond(HttpStatusCode.OK)
                    } catch (e: Exception) {
                        call.auditPrivilegedCrud("TEACHER_DEACTIVATE", "Teacher", id, success = false, message = "Could not deactivate teacher.")
                        call.respond(HttpStatusCode.InternalServerError, mapOf("message" to "Teacher delete failed"))
                    }
                }
            }
        }
    }
}
fun Application.teacherBlockRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("TeacherBlockRoutes LOADED")

            route("/api/settings/teacher-blocks") {

                get {
                    val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                    val teacherIdRaw = call.request.queryParameters["teacherId"]?.trim()
                    if (teacherIdRaw.isNullOrBlank()) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "teacherId is required"))
                        return@get
                    }

                    val teacherId = try {
                        UUID.fromString(teacherIdRaw)
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid teacherId"))
                        return@get
                    }

                    // ADMIN may only view/edit ADMIN time blocks for teachers in the same department.
                    if (claims.role == "ADMIN") {
                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@get
                        }
                        val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                        val targetDepts = TeacherRepository.findDepartmentsById(teacherId)
                        if (actorDepts.isEmpty() || targetDepts.isEmpty() || actorDepts.intersect(targetDepts).isEmpty()) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only edit admin time for teachers in their department."))
                            return@get
                        }
                    }

                    val rows = TeacherBlockRepository.listByTeacher(teacherId)
                    val visibleRows = if (claims.role == "ADMIN") {
                        rows.filter { (it["type"]?.toString().orEmpty()).trim().uppercase() == "ADMIN" }
                    } else {
                        rows
                    }
                    val out = visibleRows.map {
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

                post {
                    val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@post
                    val req = call.receive<TeacherBlockRequest>()

                    val teacherId = try {
                        UUID.fromString(req.teacherId)
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid teacherId"))
                        return@post
                    }
                    val start = LocalTime.parse(req.timeStart)
                    val end = LocalTime.parse(req.timeEnd)

                    val type = runCatching { TeacherBlockType.valueOf(req.type.trim().uppercase()) }.getOrNull()
                    if (type == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid type"))
                        return@post
                    }

                    if (claims.role == "ADMIN") {
                        if (type != TeacherBlockType.ADMIN) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only edit admin time blocks."))
                            return@post
                        }
                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@post
                        }
                        val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                        val targetDepts = TeacherRepository.findDepartmentsById(teacherId)
                        if (actorDepts.isEmpty() || targetDepts.isEmpty() || actorDepts.intersect(targetDepts).isEmpty()) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only edit admin time for teachers in their department."))
                            return@post
                        }
                    }

                    if (!start.isBefore(end)) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "timeStart must be before timeEnd"))
                        return@post
                    }

                    if (TeacherBlockRepository.hasOverlap(teacherId, req.dayOfWeek, start, end)) {
                        call.respond(HttpStatusCode.Conflict, mapOf(
                            "message" to "Teacher already has a block in this time"
                        ))
                        return@post
                    }

                    TeacherBlockRepository.create(
                        teacherId,
                        type,
                        req.dayOfWeek,
                        start,
                        end
                    )

                    call.auditPrivilegedCrud(
                        action = "TEACHER_BLOCK_CREATE",
                        entity = "TeacherBlock",
                        entityId = null,
                        success = true,
                        message = "Added a teacher time block (day ${req.dayOfWeek}, ${req.timeStart}-${req.timeEnd}, type ${req.type})."
                    )
                    call.respond(HttpStatusCode.Created)
                }

                delete("/{id}") {
                    val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@delete
                    val idRaw = call.parameters["id"]?.trim()
                    if (idRaw.isNullOrBlank()) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "id is required"))
                        return@delete
                    }
                    val id = try {
                        UUID.fromString(idRaw)
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid id"))
                        return@delete
                    }

                    val existing = TeacherBlockRepository.findById(id)
                    if (existing == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("message" to "Not found"))
                        call.auditPrivilegedCrud("TEACHER_BLOCK_DELETE", "TeacherBlock", null, success = false, message = "Could not remove teacher time block: not found.")
                        return@delete
                    }

                    if (claims.role == "ADMIN") {
                        val typeStr = (existing["type"]?.toString().orEmpty()).trim().uppercase()
                        if (typeStr != "ADMIN") {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only edit admin time blocks."))
                            return@delete
                        }

                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@delete
                        }

                        val teacherId = runCatching { UUID.fromString(existing["teacherId"]?.toString().orEmpty()) }.getOrNull()
                        if (teacherId == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@delete
                        }

                        val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                        val targetDepts = TeacherRepository.findDepartmentsById(teacherId)
                        if (actorDepts.isEmpty() || targetDepts.isEmpty() || actorDepts.intersect(targetDepts).isEmpty()) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only edit admin time for teachers in their department."))
                            return@delete
                        }
                    }

                    val deleted = TeacherBlockRepository.delete(id)
                    if (deleted <= 0) {
                        call.respond(HttpStatusCode.NotFound, mapOf("message" to "Not found"))
                        call.auditPrivilegedCrud("TEACHER_BLOCK_DELETE", "TeacherBlock", null, success = false, message = "Could not remove teacher time block: not found.")
                        return@delete
                    }
                    call.auditPrivilegedCrud("TEACHER_BLOCK_DELETE", "TeacherBlock", null, success = true, message = "Removed a teacher time block.")
                    call.respond(HttpStatusCode.NoContent)
                }
            }
        }
    }
}
