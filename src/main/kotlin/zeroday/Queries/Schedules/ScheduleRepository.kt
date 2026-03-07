package zeroday.Queries.Schedules

import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Controller.service.ScheduleTimePolicy
import zeroday.Models.db.tables.Schedules
import zeroday.Models.dto.schedule.ScheduleRequest
import zeroday.Queries.Settings.TeacherRepository
import java.time.LocalTime
import java.util.UUID

object ScheduleRepository {


    fun create(req: ScheduleRequest) {
        transaction {
            val (start, end) = ScheduleTimePolicy.normalizeStrict(
                LocalTime.parse(req.timeStart.trim()),
                LocalTime.parse(req.timeEnd.trim())
            )

            Schedules.insert {
                it[id] = UUID.randomUUID()
                it[courseCode] = req.courseCode
                it[section] = req.section
                it[curriculumId] = req.curriculumId?.let(UUID::fromString)
                it[subjectId] = UUID.fromString(req.subjectId)
                val tid = UUID.fromString(req.teacherId)
                require(TeacherRepository.isInstructorAssignable(tid)) { "Selected teacher role cannot be assigned as instructor." }
                it[teacherId] = tid
                it[roomId] = UUID.fromString(req.roomId)
                it[dayOfWeek] = req.dayOfWeek
                it[timeStart] = start
                it[timeEnd] = end
            }
        }
    }
}
