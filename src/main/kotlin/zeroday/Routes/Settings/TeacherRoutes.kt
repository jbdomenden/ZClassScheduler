package zeroday.Routes.Settings

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import org.jetbrains.exposed.exceptions.ExposedSQLException
import zeroday.Controller.audit.auditPrivilegedCrud
import zeroday.Controller.auth.requireRole
import zeroday.Controller.service.ScheduleTimePolicy
import zeroday.Controller.service.TeacherAvailabilityService
import zeroday.Models.db.tables.TeacherBlockType
import zeroday.Models.dto.teacher.TeacherBlockRequest
import zeroday.Models.dto.teacher.TeacherBlockResponse
import zeroday.Models.dto.teacher.TeacherRequest
import zeroday.Models.dto.teacher.TeacherResponse
import zeroday.Queries.Schedules.TeacherBlockRepository
import zeroday.Queries.Settings.TeacherRepository
import java.time.LocalTime
import java.util.*

private fun normalizeRole(roleRaw: String?): String {
    val r0 = (roleRaw ?: "").trim()
    if (r0.isEmpty()) return "TEACHER"

    val r = r0
        .uppercase()
        .replace("\\s+".toRegex(), "_")
        .replace("-", "_")

    return when (r) {
        "SUPERADMIN" -> "SUPER_ADMIN"
        "SUPER_ADMIN" -> "SUPER_ADMIN"
        "ADMIN" -> "ADMIN"
        "CHECKER" -> "CHECKER"
        "NONTEACHING" -> "STAFF"
        "NON_TEACHING" -> "STAFF"
        "STAFF" -> "STAFF"
        "TEACHER" -> "TEACHER"
        "INSTRUCTOR" -> "TEACHER"
        else -> r
    }
}

private fun parseDepartments(raw: String?): Set<String> =
    (raw ?: "")
        .split(",", ";", "|")
        .map { it.trim() }
        .filter { it.isNotEmpty() }
        .map { it.uppercase() }
        .toSet()

private fun roleRank(roleNorm: String): Int =
    when (normalizeRole(roleNorm)) {
        "SUPER_ADMIN" -> 3
        "ADMIN" -> 2
        else -> 1 // TEACHER, CHECKER, NON_TEACHING, etc.
    }

private fun defaultPassword(firstName: String, lastName: String): String {
    val f = firstName.trim().lowercase().replace("\\s+".toRegex(), "")
    val l = lastName.trim().lowercase().replace("\\s+".toRegex(), "")
    if (f.isEmpty() || l.isEmpty()) return "password"
    return "${f.first()}$l"
}

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
                    val requestedRole = normalizeRole(req.role)
                    if (requestedRole == "SUPER_ADMIN" && claims.role != "SUPER_ADMIN") {
                        call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Only SUPER_ADMIN can assign SUPER_ADMIN role."))
                        return@post
                    }

                    if (claims.role == "ADMIN") {
                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@post
                        }
                        val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                        val isStaffAdmin = actorDepts.contains("NON_TEACHING") || actorDepts.contains("STAFF")

                        // Role creation limits for ADMIN
                        if (isStaffAdmin) {
                            if (requestedRole != "CHECKER" && requestedRole != "STAFF") {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Staff admins can only create CHECKER or STAFF users."))
                                return@post
                            }
                            val reqDepts = parseDepartments(req.department)
                            if (reqDepts != setOf("NON_TEACHING")) {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Staff admins may only create users under NON_TEACHING department."))
                                return@post
                            }
                        } else {
                            if (requestedRole != "TEACHER") {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins may only create TEACHER users."))
                                return@post
                            }
                            val reqDepts = parseDepartments(req.department)
                            if (reqDepts.isEmpty() || actorDepts.intersect(reqDepts).isEmpty()) {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only create users within their department(s)."))
                                return@post
                            }
                        }
                    }

                    try {
                        val active = (req.status ?: "Active").equals("Active", ignoreCase = true)

                        if (req.password.trim().isEmpty()) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Password is required."))
                            call.auditPrivilegedCrud("TEACHER_CREATE", "Teacher", null, success = false, message = "Could not create teacher: missing password.")
                            return@post
                        }

                        if (TeacherRepository.existsEmpId(req.empId?.trim().orEmpty())) {
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
                            empId = req.empId?.trim().orEmpty(),
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
                    val requestedRole = normalizeRole(req.role)
                    if (requestedRole == "SUPER_ADMIN" && claims.role != "SUPER_ADMIN") {
                        call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Only SUPER_ADMIN can assign SUPER_ADMIN role."))
                        return@put
                    }

                    if (claims.role == "ADMIN") {
                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@put
                        }
                        val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                        val isStaffAdmin = actorDepts.contains("NON_TEACHING") || actorDepts.contains("STAFF")

                        val targetIdentity = TeacherRepository.findIdentityById(id)
                        if (targetIdentity == null) {
                            call.respond(HttpStatusCode.NotFound, mapOf("message" to "User not found."))
                            return@put
                        }

                        val targetDepts = parseDepartments(targetIdentity.department)
                        if (actorDepts.isEmpty() || targetDepts.isEmpty() || actorDepts.intersect(targetDepts).isEmpty()) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only edit users within their department(s)."))
                            return@put
                        }

                        // ADMIN can only manage lower roles
                        if (roleRank(targetIdentity.role) >= roleRank("ADMIN")) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only edit lower roles."))
                            return@put
                        }
                        if (roleRank(requestedRole) >= roleRank("ADMIN")) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins cannot assign ADMIN/SUPER_ADMIN roles."))
                            return@put
                        }

                        // Role update limits for ADMIN
                        if (isStaffAdmin) {
                            val tr = normalizeRole(targetIdentity.role)
                            if (tr != "CHECKER" && tr != "STAFF") {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Staff admins can only edit CHECKER or STAFF users."))
                                return@put
                            }
                            if (requestedRole != "CHECKER" && requestedRole != "STAFF") {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Staff admins can only set role to CHECKER or STAFF."))
                                return@put
                            }
                            val reqDepts = parseDepartments(req.department)
                            if (reqDepts != setOf("NON_TEACHING")) {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Staff admins may only manage users under NON_TEACHING department."))
                                return@put
                            }
                        } else {
                            if (normalizeRole(targetIdentity.role) != "TEACHER") {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only edit TEACHER users."))
                                return@put
                            }
                            if (requestedRole != "TEACHER") {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins may only set role to TEACHER."))
                                return@put
                            }
                            val reqDepts = parseDepartments(req.department)
                            if (reqDepts.isEmpty() || actorDepts.intersect(reqDepts).isEmpty()) {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only set department within their department(s)."))
                                return@put
                            }
                        }
                    }

                    try {
                        val active = (req.status ?: "Active").equals("Active", ignoreCase = true)

                        if (TeacherRepository.existsEmpId(req.empId?.trim().orEmpty(), excludeId = id)) {
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
                            empId = req.empId?.trim().orEmpty(),
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
                    val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@delete
                    val id = UUID.fromString(call.parameters["id"])
                    try {
                        if (claims.role == "ADMIN") {
                            val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                            if (actorEmail == null) {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                                return@delete
                            }
                            val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                            val isStaffAdmin = actorDepts.contains("NON_TEACHING") || actorDepts.contains("STAFF")
                            val targetIdentity = TeacherRepository.findIdentityById(id)
                            if (targetIdentity == null) {
                                call.respond(HttpStatusCode.NotFound, mapOf("message" to "User not found."))
                                return@delete
                            }
                            val targetDepts = parseDepartments(targetIdentity.department)
                            if (actorDepts.isEmpty() || targetDepts.isEmpty() || actorDepts.intersect(targetDepts).isEmpty()) {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only delete users within their department(s)."))
                                return@delete
                            }
                            if (roleRank(targetIdentity.role) >= roleRank("ADMIN")) {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only delete lower roles."))
                                return@delete
                            }
                            val tr = normalizeRole(targetIdentity.role)
                            if (isStaffAdmin) {
                                if (tr != "CHECKER" && tr != "STAFF") {
                                    call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Staff admins can only delete CHECKER or STAFF users."))
                                    return@delete
                                }
                            } else {
                                if (tr != "TEACHER") {
                                    call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only delete TEACHER users."))
                                    return@delete
                                }
                            }
                        }

                        TeacherRepository.deactivate(id)
                        call.auditPrivilegedCrud("TEACHER_DEACTIVATE", "Teacher", id, success = true, message = null)
                        call.respond(HttpStatusCode.OK)
                    } catch (e: Exception) {
                        call.auditPrivilegedCrud("TEACHER_DEACTIVATE", "Teacher", id, success = false, message = "Could not deactivate teacher.")
                        call.respond(HttpStatusCode.InternalServerError, mapOf("message" to "Teacher delete failed"))
                    }
                }

                // Reset password to default (ADMIN/SUPER_ADMIN)
                post("/{id}/reset-password") {
                    val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@post
                    val id = UUID.fromString(call.parameters["id"])

                    val target = TeacherRepository.findIdentityById(id)
                    if (target == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("message" to "User not found."))
                        return@post
                    }

                    if (claims.role == "ADMIN") {
                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@post
                        }
                        val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                        val isStaffAdmin = actorDepts.contains("NON_TEACHING") || actorDepts.contains("STAFF")

                        val targetDepts = parseDepartments(target.department)
                        if (actorDepts.isEmpty() || targetDepts.isEmpty() || actorDepts.intersect(targetDepts).isEmpty()) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only reset passwords within their department(s)."))
                            return@post
                        }
                        if (roleRank(target.role) >= roleRank("ADMIN")) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only reset passwords for lower roles."))
                            return@post
                        }

                        // If staff admin: only staff roles should be manageable here.
                        if (isStaffAdmin) {
                            if (normalizeRole(target.role) != "CHECKER" && normalizeRole(target.role) != "STAFF") {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Staff admins can only reset passwords for CHECKER or STAFF users."))
                                return@post
                            }
                            if (targetDepts != setOf("NON_TEACHING")) {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Staff admins may only manage users under NON_TEACHING department."))
                                return@post
                            }
                        } else {
                            if (normalizeRole(target.role) != "TEACHER") {
                                call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only reset passwords for TEACHER users."))
                                return@post
                            }
                        }
                    }

                    val pwd = defaultPassword(target.firstName, target.lastName)
                    try {
                        TeacherRepository.resetPasswordByTeacherId(id, pwd)
                        call.auditPrivilegedCrud(
                            action = "TEACHER_RESET_PASSWORD",
                            entity = "Teacher",
                            entityId = id,
                            success = true,
                            message = "Reset password to default for '${target.firstName} ${target.lastName}' (${target.email})."
                        )
                        call.respond(HttpStatusCode.OK, mapOf("message" to "Password reset."))
                    } catch (e: Exception) {
                        call.auditPrivilegedCrud("TEACHER_RESET_PASSWORD", "Teacher", id, success = false, message = "Could not reset password.")
                        call.respond(HttpStatusCode.InternalServerError, mapOf("message" to "Password reset failed"))
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

                    // ADMIN may only manage admin time blocks for users in the same department(s).
                    if (claims.role == "ADMIN") {
                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@get
                        }
                        val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                        val targetDepts = TeacherRepository.findDepartmentsById(teacherId)
                        if (actorDepts.isEmpty() || targetDepts.isEmpty() || actorDepts.intersect(targetDepts).isEmpty()) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only manage admin time for users in their department."))
                            return@get
                        }
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

                post {
                    val claims = call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@post
                    val req = call.receive<TeacherBlockRequest>()

                    val teacherId = try {
                        UUID.fromString(req.teacherId)
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid teacherId"))
                        return@post
                    }

                    val type = runCatching { TeacherBlockType.valueOf(req.type.trim().uppercase()) }.getOrNull()
                    if (type == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid type"))
                        return@post
                    }

                    if (claims.role == "ADMIN") {
                        val actorEmail = claims.email?.trim()?.takeIf { it.isNotEmpty() }
                        if (actorEmail == null) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Forbidden"))
                            return@post
                        }
                        val actorDepts = TeacherRepository.findDepartmentsByEmail(actorEmail)
                        val targetDepts = TeacherRepository.findDepartmentsById(teacherId)
                        if (actorDepts.isEmpty() || targetDepts.isEmpty() || actorDepts.intersect(targetDepts).isEmpty()) {
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only manage admin time for users in their department."))
                            return@post
                        }
                    }

                    val dayNorm = req.dayOfWeek.trim().uppercase()

                    // Teacher-block time rules:
                    // - REST_DAY: fixed to full day bounds
                    // - BREAK: fixed to 1 hour
                    // - ADMIN: any length (30-min aligned) up to end-of-day
                    val dayStart = ScheduleTimePolicy.EARLIEST_START
                    val dayEnd = ScheduleTimePolicy.LATEST_END

                    val (start, end) = if (type == TeacherBlockType.REST_DAY) {
                        dayStart to dayEnd
                    } else {
                        val start0 = runCatching { LocalTime.parse(req.timeStart.trim()) }.getOrNull()
                        val end0 = runCatching { LocalTime.parse(req.timeEnd.trim()) }.getOrNull()
                        if (start0 == null || end0 == null) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid timeStart/timeEnd"))
                            return@post
                        }
                        if (!end0.isAfter(start0)) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("message" to "timeStart must be before timeEnd"))
                            return@post
                        }
                        if (!ScheduleTimePolicy.isOnHalfHour(start0) || !ScheduleTimePolicy.isOnHalfHour(end0)) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Times must be aligned to the 30-minute grid."))
                            return@post
                        }
                        if (start0.isBefore(dayStart) || end0.isAfter(dayEnd)) {
                            call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Outside bounds 07:00-21:00."))
                            return@post
                        }
                        if (type == TeacherBlockType.BREAK) {
                            val mins = java.time.Duration.between(start0, end0).toMinutes()
                            if (mins != 60L) {
                                call.respond(HttpStatusCode.BadRequest, mapOf("message" to "BREAK must be exactly 1 hour."))
                                return@post
                            }
                        }
                        start0 to end0
                    }

                    // Teacher blocks cannot overwrite class schedules.
                    if (TeacherBlockRepository.hasScheduleOverlap(teacherId, dayNorm, start, end)) {
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Cannot add block: overlaps an existing class schedule."))
                        return@post
                    }

                    if (TeacherBlockRepository.hasOverlap(teacherId, dayNorm, start, end)) {
                        call.respond(HttpStatusCode.Conflict, mapOf(
                            "message" to "Teacher already has a block in this time"
                        ))
                        return@post
                    }

                    TeacherBlockRepository.create(
                        teacherId,
                        type,
                        dayNorm,
                        start,
                        end
                    )

                    call.auditPrivilegedCrud(
                        action = "TEACHER_BLOCK_CREATE",
                        entity = "TeacherBlock",
                        entityId = null,
                        success = true,
                        message = "Added a teacher time block (day $dayNorm, ${start}-${end}, type ${type.name})."
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
                            call.respond(HttpStatusCode.Forbidden, mapOf("message" to "Admins can only manage admin time for users in their department."))
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
