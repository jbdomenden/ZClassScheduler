package zeroday.Controller.audit

import io.ktor.server.application.ApplicationCall
import zeroday.Queries.Settings.ScheduleLogsRepository

fun ApplicationCall.auditScheduleChange(
    action: String,
    entityType: String,
    entityId: String? = null,
    scheduleBlock: String? = null,
    roomCode: String? = null,
    sectionCode: String? = null,
    teacherName: String? = null,
    previousValue: String? = null,
    newValue: String? = null,
    notes: String? = null,
) {
    val actor = jwtActorOrNull() ?: return
    ScheduleLogsRepository.log(
        actorUserKey = actor.userKey,
        actorRole = actor.role,
        actorEmail = actor.email,
        action = action,
        entityType = entityType,
        entityId = entityId,
        scheduleBlock = scheduleBlock,
        roomCode = roomCode,
        sectionCode = sectionCode,
        teacherName = teacherName,
        previousValue = previousValue,
        newValue = newValue,
        notes = notes,
    )
}
