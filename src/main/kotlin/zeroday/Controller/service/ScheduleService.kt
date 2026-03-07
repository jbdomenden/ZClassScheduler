package zeroday.Controller.service


import zeroday.Models.dto.schedule.ScheduleRequest
import zeroday.Models.db.tables.*
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Queries.Settings.TeacherRepository
import java.time.LocalTime
import java.util.*


object ScheduleService {


    fun create(req: ScheduleRequest) {
        transaction {
            val (start, end) = ScheduleTimePolicy.normalizeStrict(
                LocalTime.parse(req.timeStart.trim()),
                LocalTime.parse(req.timeEnd.trim())
            )

            Schedules.insert {
                it[id] = UUID.randomUUID()
                it[dayOfWeek] = req.dayOfWeek
                it[timeStart] = start
                it[timeEnd] = end
                it[roomId] = UUID.fromString(req.roomId)
                val tid = UUID.fromString(req.teacherId)
                require(TeacherRepository.isInstructorAssignable(tid)) { "Selected teacher role cannot be assigned as instructor." }
                it[teacherId] = tid
                it[courseCode] = req.courseCode
                it[sectionName] = req.sectionName
                it[subjectName] = req.subjectName
            }
        }
    }
}
