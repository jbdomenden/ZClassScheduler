package zeroday.Routes.Settings


import zeroday.Models.dto.subject.SubjectRequest
import zeroday.Queries.Schedules.SubjectRepository
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import io.ktor.http.*
import java.util.UUID


fun Application.subjectRoutes() {
    routing {
        authenticate("auth-jwt") {
            log.info("✅ SubjectRoutes LOADED")

            route("/settings/subjects") {


                get {
                    val course = call.request.queryParameters["course"]!!
                    val yearTerm = call.request.queryParameters["yearTerm"]!!
                    val curriculum = call.request.queryParameters["curriculum"]


                    call.respond(
                        SubjectRepository.findFiltered(course, curriculum, yearTerm)
                    )
                }


                post {
                    val req = call.receive<SubjectRequest>()
                    val id = SubjectRepository.create(req)
                    call.respond(HttpStatusCode.Created, mapOf("id" to id.toString()))
                }


                delete("/{id}") {
                    val id = UUID.fromString(call.parameters["id"])
                    SubjectRepository.deactivate(id)
                    call.respond(HttpStatusCode.OK)
                }
            }
        }
    }
}