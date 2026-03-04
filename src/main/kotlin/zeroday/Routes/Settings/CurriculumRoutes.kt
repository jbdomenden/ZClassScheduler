package zeroday.Routes.Settings


import zeroday.Models.dto.curriculum.CurriculumRequest
import zeroday.Queries.Settings.CurriculumRepository
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import io.ktor.http.*
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
                    val req = call.receive<CurriculumRequest>()
                    val id = CurriculumRepository.create(req)
                    call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                }


                delete("/{id}") {
                    val id = UUID.fromString(call.parameters["id"])
                    CurriculumRepository.deactivate(id)
                    call.respond(HttpStatusCode.OK)
                }
            }
        }
    }
}
fun Application.curriculumManagementRoutes() {
    routing {
        route("/api/settings/curriculums") {

            // List curriculums (optionally filter by course)
            get {
                val course = call.request.queryParameters["course"]
                call.respond(CurriculumRepository.listAll(course))
            }

            // Create curriculum (no subjects)
            post {
                val req = call.receive<CurriculumRequest>()
                val id = CurriculumRepository.create(req)
                call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
            }

            // Upload curriculum + subjects (parsed from PDF on the frontend)
            post("/upload") {
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

                call.respond(HttpStatusCode.Created, mapOf("id" to curriculumId.toString()))
            }

            // Update active status
            put("/{id}/status") {
                val id = UUID.fromString(call.parameters["id"])
                val body = call.receive<Map<String, Boolean>>()
                val active = body["active"] ?: true
                CurriculumRepository.setActive(id, active)
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
                val id = UUID.fromString(call.parameters["id"])
                CurriculumRepository.hardDelete(id)
                call.respond(HttpStatusCode.NoContent)
            }
        }
    }
}
