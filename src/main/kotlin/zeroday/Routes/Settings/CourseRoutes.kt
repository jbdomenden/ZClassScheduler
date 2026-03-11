package zeroday.Routes.Settings

import zeroday.Models.dto.course.CourseRequest
import zeroday.Queries.Settings.CourseRepository
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import io.ktor.http.*
import org.jetbrains.exposed.exceptions.ExposedSQLException
import zeroday.Controller.audit.auditPrivilegedCrud
import zeroday.Controller.auth.requireRole
import java.util.UUID

fun Application.courseRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("CourseRoutes LOADED")

            route("/settings/courses") {

                get {
                    call.respond(CourseRepository.findAll())
                }

                post {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@post
                    val req = call.receive<CourseRequest>()
                    val id = CourseRepository.create(req)
                    call.auditPrivilegedCrud("COURSE_CREATE", "Course", id, success = true, message = "Created course '${req.code}' (${req.name}).")
                    call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                }

                put("/{id}") {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@put
                    val id = UUID.fromString(call.parameters["id"])
                    val req = call.receive<CourseRequest>()
                    CourseRepository.update(id, req)
                    call.auditPrivilegedCrud("COURSE_UPDATE", "Course", id, success = true, message = "Updated course '${req.code}' (${req.name}).")
                    call.respond(HttpStatusCode.OK)
                }

                delete("/{id}") {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@delete
                    val id = UUID.fromString(call.parameters["id"])
                    CourseRepository.deactivate(id)
                    call.auditPrivilegedCrud("COURSE_DEACTIVATE", "Course", id, success = true, message = null)
                    call.respond(HttpStatusCode.OK)
                }
            }
        }
    }
}
fun Application.courseManagementRoutes() {
    routing {
        authenticate("auth-jwt") {
            route("/api/settings/courses") {

                // List is used by schedulers: any authenticated role can read.
                get {
                    call.respond(HttpStatusCode.OK, CourseRepository.findAll())
                }

                post {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@post
                    try {
                        val req = call.receive<CourseRequest>()
                        val id = CourseRepository.create(req)
                        call.auditPrivilegedCrud("COURSE_CREATE", "Course", id, success = true, message = "Created course '${req.code}' (${req.name}).")
                        call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                    } catch (e: ExposedSQLException) {
                        call.application.log.error("Course create failed", e)
                        call.auditPrivilegedCrud("COURSE_CREATE", "Course", null, success = false, message = "Could not create course: course code already exists.")
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Course code must be unique."))
                    }
                }

                put("/{id}") {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@put
                    val id = UUID.fromString(call.parameters["id"])
                    try {
                        val req = call.receive<CourseRequest>()
                        CourseRepository.update(id, req)
                        call.auditPrivilegedCrud("COURSE_UPDATE", "Course", id, success = true, message = "Updated course '${req.code}' (${req.name}).")
                        call.respond(HttpStatusCode.OK)
                    } catch (e: ExposedSQLException) {
                        call.application.log.error("Course update failed", e)
                        call.auditPrivilegedCrud("COURSE_UPDATE", "Course", id, success = false, message = "Could not update course: course code already exists.")
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to "Course code must be unique."))
                    }
                }

                // Toggle status without changing other fields
                put("/{id}/status") {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@put
                    val id = UUID.fromString(call.parameters["id"])
                    val body = call.receive<Map<String, Boolean>>()
                    val active = body["active"] ?: true
                    CourseRepository.setActive(id, active)
                    call.auditPrivilegedCrud("COURSE_SET_ACTIVE", "Course", id, success = true, message = "Set course '${id}' status to ${if (active) "Active" else "Inactive"}.")
                    call.respond(HttpStatusCode.OK)
                }

                // Delete maps to deactivate
                delete("/{id}") {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@delete
                    val id = UUID.fromString(call.parameters["id"])
                    CourseRepository.deactivate(id)
                    call.auditPrivilegedCrud("COURSE_DEACTIVATE", "Course", id, success = true, message = null)
                    call.respond(HttpStatusCode.OK)
                }
            }
        }
    }
}
