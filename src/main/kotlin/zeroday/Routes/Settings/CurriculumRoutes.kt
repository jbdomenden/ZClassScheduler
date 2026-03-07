package zeroday.Routes.Settings


import zeroday.Models.dto.curriculum.CurriculumRequest
import zeroday.Queries.Settings.CurriculumRepository
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import io.ktor.http.*
import zeroday.Controller.audit.auditPrivilegedCrud
import zeroday.Controller.auth.requireRole
import zeroday.Models.dto.curriculum.CurriculumUploadRequest
import zeroday.Models.dto.subject.SubjectRequest
import zeroday.Models.dto.subject.SubjectResponse
import zeroday.Queries.Schedules.SubjectRepository
import java.util.UUID


fun Application.curriculumRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("✅ CurriculumRoutes LOADED")

            route("/settings/curriculum") {


                get("/{courseCode}") {
                    val courseCode = call.parameters["courseCode"]!!
                    call.respond(CurriculumRepository.findByCourse(courseCode))
                }


                post {
                    call.requireRole(setOf("SUPER_ADMIN")) ?: return@post
                    val req = call.receive<CurriculumRequest>()
                    val id = CurriculumRepository.create(req)
                    call.auditPrivilegedCrud("CURRICULUM_CREATE", "Curriculum", id, success = true, message = "Created curriculum '${req.name}' for course ${req.courseCode}.")
                    call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                }


                delete("/{id}") {
                    call.requireRole(setOf("SUPER_ADMIN")) ?: return@delete
                    val id = UUID.fromString(call.parameters["id"])
                    CurriculumRepository.deactivate(id)
                    call.auditPrivilegedCrud("CURRICULUM_DEACTIVATE", "Curriculum", id, success = true, message = null)
                    call.respond(HttpStatusCode.OK)
                }
            }
        }
    }
}
fun Application.curriculumManagementRoutes() {
    routing {
        authenticate("auth-jwt") {
            route("/api/settings/curriculums") {

                // List curriculums (optionally filter by course) - used by schedulers
                get {
                    val course = call.request.queryParameters["course"]
                    call.respond(CurriculumRepository.listAll(course))
                }

                // Create curriculum (no subjects)
                post {
                    call.requireRole(setOf("SUPER_ADMIN")) ?: return@post
                    try {
                        val req = call.receive<CurriculumRequest>()
                        val id = CurriculumRepository.create(req)
                        call.auditPrivilegedCrud("CURRICULUM_CREATE", "Curriculum", id, success = true, message = "Created curriculum '${req.name}' for course ${req.courseCode}.")
                        call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                    } catch (e: IllegalArgumentException) {
                        call.auditPrivilegedCrud("CURRICULUM_CREATE", "Curriculum", null, success = false, message = "Could not create curriculum: curriculum code already exists.")
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to (e.message ?: "Curriculum code must be unique.")))
                    }
                }

                // Upload curriculum + subjects (parsed from PDF on the frontend)
                post("/upload") {
                    call.requireRole(setOf("SUPER_ADMIN")) ?: return@post
                    try {
                        val req = call.receive<CurriculumUploadRequest>()
                        val curriculumId = CurriculumRepository.create(
                            CurriculumRequest(
                                courseCode = req.courseCode,
                                name = req.name,
                                dept = req.dept
                            )
                        )

                        req.subjects.forEach { s ->
                            SubjectRepository.create(
                                SubjectRequest(
                                    courseCode = req.courseCode,
                                    curriculumId = curriculumId.toString(),
                                    code = s.code,
                                    name = s.name,
                                    yearTerm = s.yearTerm
                                )
                            )
                        }

                        call.auditPrivilegedCrud(
                            action = "CURRICULUM_UPLOAD",
                            entity = "Curriculum",
                            entityId = curriculumId,
                            success = true,
                            message = "Uploaded curriculum '${req.name}' for course ${req.courseCode} with ${req.subjects.size} subjects."
                        )
                        call.respond(HttpStatusCode.Created, mapOf("id" to curriculumId.toString()))
                    } catch (e: IllegalArgumentException) {
                        call.auditPrivilegedCrud("CURRICULUM_UPLOAD", "Curriculum", null, success = false, message = "Could not create curriculum: curriculum code already exists.")
                        call.respond(HttpStatusCode.Conflict, mapOf("message" to (e.message ?: "Curriculum code must be unique.")))
                    }
                }

                // Update active status
                put("/{id}/status") {
                    call.requireRole(setOf("SUPER_ADMIN")) ?: return@put
                    val id = UUID.fromString(call.parameters["id"])
                    val body = call.receive<Map<String, Boolean>>()
                    val active = body["active"] ?: true
                    CurriculumRepository.setActive(id, active)
                    call.auditPrivilegedCrud("CURRICULUM_SET_ACTIVE", "Curriculum", id, success = true, message = "Set curriculum '${id}' status to ${if (active) "Active" else "Inactive"}.")
                    call.respond(HttpStatusCode.OK)
                }

                // Get subjects for a curriculum
                get("/{id}/subjects") {
                    val id = call.parameters["id"]!!
                    val subjects: List<SubjectResponse> = CurriculumRepository.subjectsForCurriculum(id)
                    call.respond(HttpStatusCode.OK, subjects)
                }

                // HARD DELETE curriculum
                delete("/{id}") {
                    call.requireRole(setOf("SUPER_ADMIN")) ?: return@delete
                    val id = UUID.fromString(call.parameters["id"])
                    CurriculumRepository.hardDelete(id)
                    call.auditPrivilegedCrud("CURRICULUM_HARD_DELETE", "Curriculum", id, success = true, message = null)
                    call.respond(HttpStatusCode.NoContent)
                }
            }
        }
    }
}
