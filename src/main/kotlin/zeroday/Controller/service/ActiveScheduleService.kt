package zeroday.Controller.service

import zeroday.Models.db.tables.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.*

object ActiveScheduleService {

    fun getActiveNow(): List<ResultRow> {
        val now = LocalTime.now()
        val today = LocalDate.now().dayOfWeek.name  // MONDAY, TUESDAY...

        return transaction {
            Schedules.select {
                (Schedules.dayOfWeek eq today) and
                        (Schedules.timeStart lessEq now) and
                        (Schedules.timeEnd greater now)
            }.toList()
        }
    }
    fun getActiveRooms(): List<String> =
        getActiveNow()
            .map { it[Schedules.roomId].toString() }
            .distinct()
    fun getActiveTeachers(): List<String> =
        getActiveNow()
            .map { it[Schedules.teacherId].toString() }
            .distinct()
    fun getActiveSections(): List<String> =
        getActiveNow()
            .map { it[Schedules.sectionName] }
            .distinct()

}
