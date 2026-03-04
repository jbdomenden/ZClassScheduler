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
import java.util.UUID

fun Application.courseRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("✅ CourseRoutes LOADED")

            route("/settings/courses") {

                get {
                    call.respond(CourseRepository.findAll())
                }

                post {
                    val req = call.receive<CourseRequest>()
                    val id = CourseRepository.create(req)
                    call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                }

                put("/{id}") {
                    val id = UUID.fromString(call.parameters["id"])
                    val req = call.receive<CourseRequest>()
                    CourseRepository.update(id, req)
                    call.respond(HttpStatusCode.OK)
                }

                delete("/{id}") {
                    val id = UUID.fromString(call.parameters["id"])
                    CourseRepository.deactivate(id)
                    call.respond(HttpStatusCode.OK)
                }
            }
        }
    }
}
fun Application.courseManagementRoutes() {
    routing {
        route("/api/settings/courses") {

            get {
                call.respond(HttpStatusCode.OK, CourseRepository.findAll())
            }

            post {
                try {
                    val req = call.receive<CourseRequest>()
                    val id = CourseRepository.create(req)
                    call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                } catch (e: ExposedSQLException) {
                    call.application.log.error("Course create failed", e)
                    call.respond(HttpStatusCode.Conflict, mapOf("message" to "Course code must be unique."))
                }
            }

            put("/{id}") {
                try {
                    val id = UUID.fromString(call.parameters["id"])
                    val req = call.receive<CourseRequest>()
                    CourseRepository.update(id, req)
                    call.respond(HttpStatusCode.OK)
                } catch (e: ExposedSQLException) {
                    call.application.log.error("Course update failed", e)
                    call.respond(HttpStatusCode.Conflict, mapOf("message" to "Course code must be unique."))
                }
            }

            // Toggle status without changing other fields
            put("/{id}/status") {
                val id = UUID.fromString(call.parameters["id"])
                val body = call.receive<Map<String, Boolean>>()
                val active = body["active"] ?: true
                CourseRepository.setActive(id, active)
                call.respond(HttpStatusCode.OK)
            }

            // Delete maps to deactivate
            delete("/{id}") {
                val id = UUID.fromString(call.parameters["id"])
                CourseRepository.deactivate(id)
                call.respond(HttpStatusCode.OK)
            }
        }
    }
}
