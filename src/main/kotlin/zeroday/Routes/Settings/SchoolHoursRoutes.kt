package zeroday.Routes.Settings

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.auth.authenticate
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import kotlinx.serialization.Serializable
import zeroday.Controller.auth.requireRole
import zeroday.Queries.Settings.SchoolHoursRepository
import java.util.UUID

@Serializable
data class DayRulePayload(val dayOfWeek: String, val isOpen: Boolean, val timeStart: String, val timeEnd: String)

@Serializable
data class SchoolHoursUpsertPayload(
    val currentSchoolYear: String,
    val currentTerm: String,
    val timezone: String = "Asia/Manila",
    val dayRules: List<DayRulePayload>
)

@Serializable
data class BreakCreatePayload(
    val title: String,
    val breakType: String = "GENERAL",
    val dayOfWeek: String? = null,
    val timeStart: String,
    val timeEnd: String,
    val notes: String? = null,
)

fun Application.schoolHoursRoutes() {
    routing {
        authenticate("auth-jwt") {
            route("/api/settings/school-hours") {
                get("/active") {
                    val cfg = SchoolHoursRepository.getActiveConfig()
                    if (cfg == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("success" to false, "message" to "No active school-hours settings."))
                    } else {
                        call.respond(HttpStatusCode.OK, mapOf("success" to true, "data" to cfg))
                    }
                }

                post {
                    val claims = call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@post
                    val body = call.receive<SchoolHoursUpsertPayload>()
                    val id = SchoolHoursRepository.upsertActive(
                        schoolYear = body.currentSchoolYear,
                        term = body.currentTerm,
                        timezone = body.timezone,
                        dayRules = body.dayRules.map { SchoolHoursRepository.DayRuleDto(it.dayOfWeek, it.isOpen, it.timeStart, it.timeEnd) },
                        actor = claims.email
                    )
                    call.respond(HttpStatusCode.OK, mapOf("success" to true, "id" to id.toString()))
                }

                get("/{id}/breaks") {
                    val id = runCatching { UUID.fromString(call.parameters["id"]) }.getOrNull()
                    if (id == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Invalid id"))
                        return@get
                    }
                    call.respond(mapOf("success" to true, "items" to SchoolHoursRepository.listBreaks(id)))
                }

                post("/{id}/breaks") {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@post
                    val id = runCatching { UUID.fromString(call.parameters["id"]) }.getOrNull()
                    if (id == null) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("success" to false, "message" to "Invalid id"))
                        return@post
                    }
                    val body = call.receive<BreakCreatePayload>()
                    val bid = SchoolHoursRepository.addBreak(
                        settingsId = id,
                        title = body.title,
                        breakType = body.breakType,
                        dayOfWeek = body.dayOfWeek,
                        timeStart = body.timeStart,
                        timeEnd = body.timeEnd,
                        notes = body.notes
                    )
                    call.respond(HttpStatusCode.Created, mapOf("success" to true, "id" to bid.toString()))
                }
            }

            route("/api/settings/academic-period") {
                get("/current") {
                    val p = SchoolHoursRepository.getActivePeriod()
                    if (p == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("success" to false, "message" to "No active school year and term configured."))
                    } else {
                        call.respond(mapOf("success" to true, "schoolYear" to p.schoolYear, "term" to p.term))
                    }
                }
            }
        }
    }
}
