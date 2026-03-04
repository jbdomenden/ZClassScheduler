package zeroday.Controller.service

import zeroday.Models.db.tables.Teachers
import zeroday.Models.db.tables.Schedules
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

object TeacherAvailabilityService {

    fun getFreeTeachersNow(): List<Map<String, String>> = transaction {
        val now = LocalTime.now()
        val today = LocalDate.now().dayOfWeek.name

        val busyTeacherIds: List<UUID> = Schedules
            .slice(Schedules.teacherId)
            .select {
                (Schedules.dayOfWeek eq today) and
                        (Schedules.timeStart less now) and
                        (Schedules.timeEnd greater now)
            }
            .mapNotNull { it[Schedules.teacherId] } // ✅ UUID?
            .distinct()

        Teachers
            .select {
                (Teachers.active eq true) and
                        (Teachers.id notInList busyTeacherIds)
            }
            .map {
                mapOf(
                    "id" to it[Teachers.id].toString(),
                    "name" to "${it[Teachers.firstName]} ${it[Teachers.lastName]}"
                )
            }
    }
}
