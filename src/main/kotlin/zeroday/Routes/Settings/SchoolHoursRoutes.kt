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
data class DayRuleViewResponse(
    val id: String,
    val dayOfWeek: String,
    val isOpen: Boolean,
    val timeStart: String,
    val timeEnd: String,
)

@Serializable
data class BreakResponse(
    val id: String,
    val title: String,
    val breakType: String,
    val dayOfWeek: String? = null,
    val timeStart: String,
    val timeEnd: String,
    val notes: String? = null,
)

@Serializable
data class SchoolHoursConfigResponse(
    val id: String,
    val currentSchoolYear: String,
    val currentTerm: String,
    val timezone: String,
    val dayRules: List<DayRuleViewResponse>,
    val breaks: List<BreakResponse>,
)

@Serializable
data class SchoolHoursActiveResponse(
    val success: Boolean,
    val message: String? = null,
    val data: SchoolHoursConfigResponse? = null,
)

@Serializable
data class SchoolHoursUpsertResponse(
    val success: Boolean,
    val id: String? = null,
    val message: String? = null,
)

@Serializable
data class BreaksListResponse(
    val success: Boolean,
    val items: List<BreakResponse> = emptyList(),
    val message: String? = null,
)

@Serializable
data class AcademicPeriodResponse(
    val success: Boolean,
    val schoolYear: String? = null,
    val term: String? = null,
    val message: String? = null,
)

private fun toBreakResponse(item: SchoolHoursRepository.BreakDto): BreakResponse = BreakResponse(
    id = item.id,
    title = item.title,
    breakType = item.breakType,
    dayOfWeek = item.dayOfWeek,
    timeStart = item.timeStart,
    timeEnd = item.timeEnd,
    notes = item.notes,
)

fun Application.schoolHoursRoutes() {
    routing {
        authenticate("auth-jwt") {
            route("/api/settings/school-hours") {
                get("/active") {
                    val cfg = SchoolHoursRepository.getActiveConfig()
                    if (cfg == null) {
                        call.respond(
                            HttpStatusCode.NotFound,
                            SchoolHoursActiveResponse(success = false, message = "No active school-hours settings.")
                        )
                    } else {
                        call.respond(
                            HttpStatusCode.OK,
                            SchoolHoursActiveResponse(
                                success = true,
                                data = SchoolHoursConfigResponse(
                                    id = cfg.id,
                                    currentSchoolYear = cfg.currentSchoolYear,
                                    currentTerm = cfg.currentTerm,
                                    timezone = cfg.timezone,
                                    dayRules = cfg.dayRules.map {
                                        DayRuleViewResponse(
                                            id = it.id,
                                            dayOfWeek = it.dayOfWeek,
                                            isOpen = it.isOpen,
                                            timeStart = it.timeStart,
                                            timeEnd = it.timeEnd,
                                        )
                                    },
                                    breaks = cfg.breaks.map(::toBreakResponse)
                                )
                            )
                        )
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
                    call.respond(HttpStatusCode.OK, SchoolHoursUpsertResponse(success = true, id = id.toString()))
                }

                get("/{id}/breaks") {
                    val id = runCatching { UUID.fromString(call.parameters["id"]) }.getOrNull()
                    if (id == null) {
                        call.respond(HttpStatusCode.BadRequest, BreaksListResponse(success = false, message = "Invalid id"))
                        return@get
                    }
                    call.respond(BreaksListResponse(success = true, items = SchoolHoursRepository.listBreaks(id).map(::toBreakResponse)))
                }

                post("/{id}/breaks") {
                    call.requireRole(setOf("SUPER_ADMIN", "ACADEMIC_HEAD")) ?: return@post
                    val id = runCatching { UUID.fromString(call.parameters["id"]) }.getOrNull()
                    if (id == null) {
                        call.respond(HttpStatusCode.BadRequest, SchoolHoursUpsertResponse(success = false, message = "Invalid id"))
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
                    call.respond(HttpStatusCode.Created, SchoolHoursUpsertResponse(success = true, id = bid.toString()))
                }
            }

            route("/api/settings/academic-period") {
                get("/current") {
                    val p = SchoolHoursRepository.getActivePeriod()
                    if (p == null) {
                        call.respond(
                            HttpStatusCode.NotFound,
                            AcademicPeriodResponse(success = false, message = "No active school year and term configured.")
                        )
                    } else {
                        call.respond(AcademicPeriodResponse(success = true, schoolYear = p.schoolYear, term = p.term))
                    }
                }
            }
        }
    }
}
