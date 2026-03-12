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

@Serializable
data class MessageResponse(val success: Boolean, val message: String)

@Serializable
data class ActiveSchoolHoursResponse(val success: Boolean, val data: SchoolHoursRepository.ActiveConfigDto)

@Serializable
data class IdResponse(val success: Boolean, val id: String)

@Serializable
data class BreakListResponse(val success: Boolean, val items: List<SchoolHoursRepository.BreakDto>)

@Serializable
data class ActivePeriodResponse(val success: Boolean, val schoolYear: String, val term: String)

fun Application.schoolHoursRoutes() {
    routing {
        authenticate("auth-jwt") {
            route("/api/settings/school-hours") {
                get("/active") {
                    val cfg = SchoolHoursRepository.getActiveConfig()
                    if (cfg == null) {
                        call.respond(HttpStatusCode.NotFound, MessageResponse(success = false, message = "No active school-hours settings."))
                    } else {
                        call.respond(HttpStatusCode.OK, ActiveSchoolHoursResponse(success = true, data = cfg))
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
                    call.respond(HttpStatusCode.OK, IdResponse(success = true, id = id.toString()))
                }

                get("/{id}/breaks") {
                    val id = runCatching { UUID.fromString(call.parameters["id"]) }.getOrNull()
                    if (id == null) {
                        call.respond(HttpStatusCode.BadRequest, MessageResponse(success = false, message = "Invalid id"))
                        return@get
                    }
                    call.respond(BreakListResponse(success = true, items = SchoolHoursRepository.listBreaks(id)))
                }

                post("/{id}/breaks") {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@post
                    val id = runCatching { UUID.fromString(call.parameters["id"]) }.getOrNull()
                    if (id == null) {
                        call.respond(HttpStatusCode.BadRequest, MessageResponse(success = false, message = "Invalid id"))
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
                    call.respond(HttpStatusCode.Created, IdResponse(success = true, id = bid.toString()))
                }
            }

            route("/api/settings/academic-period") {
                get("/current") {
                    val p = SchoolHoursRepository.getActivePeriod()
                    if (p == null) {
                        call.respond(
                            HttpStatusCode.NotFound,
                            MessageResponse(success = false, message = "No active school year and term configured.")
                        )
                    } else {
                        call.respond(ActivePeriodResponse(success = true, schoolYear = p.schoolYear, term = p.term))
                    }
                }
            }
        }
    }
}
