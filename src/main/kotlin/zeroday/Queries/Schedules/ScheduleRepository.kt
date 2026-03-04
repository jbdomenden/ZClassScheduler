package zeroday.Queries.Schedules

import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.Schedules
import zeroday.Models.dto.schedule.ScheduleRequest
import java.time.LocalTime
import java.util.UUID

object ScheduleRepository {


    fun create(req: ScheduleRequest) {
        transaction {
            Schedules.insert {
                it[id] = UUID.randomUUID()
                it[courseCode] = req.courseCode
                it[section] = req.section
                it[curriculumId] = req.curriculumId?.let(UUID::fromString)
                it[subjectId] = UUID.fromString(req.subjectId)
                it[teacherId] = UUID.fromString(req.teacherId)
                it[roomId] = UUID.fromString(req.roomId)
                it[dayOfWeek] = req.dayOfWeek
                it[timeStart] = LocalTime.parse(req.timeStart)
                it[timeEnd] = LocalTime.parse(req.timeEnd)
            }
        }
    }
}