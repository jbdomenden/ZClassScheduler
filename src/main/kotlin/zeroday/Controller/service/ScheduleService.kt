package zeroday.Controller.service


import zeroday.Models.dto.schedule.ScheduleRequest
import zeroday.Models.db.tables.*
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalTime
import java.util.*


object ScheduleService {


    fun create(req: ScheduleRequest) {
        transaction {
            Schedules.insert {
                it[id] = UUID.randomUUID()
                it[dayOfWeek] = req.dayOfWeek
                it[timeStart] = LocalTime.parse(req.timeStart)
                it[timeEnd] = LocalTime.parse(req.timeEnd)
                it[roomId] = UUID.fromString(req.roomId)
                it[teacherId] = UUID.fromString(req.teacherId)
                it[courseCode] = req.courseCode
                it[sectionName] = req.sectionName
                it[subjectName] = req.subjectName
            }
        }
    }
}