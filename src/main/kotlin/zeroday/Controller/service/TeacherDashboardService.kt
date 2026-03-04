package zeroday.Controller.service

import zeroday.Models.db.tables.*
import zeroday.Models.dto.dashboard.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import java.time.LocalTime

object TeacherDashboardService {

    private fun today(): String =
        LocalDate.now().dayOfWeek.name  // MONDAY, TUESDAY...

    private fun now(): LocalTime = LocalTime.now()

    /**
     * Teachers with classes TODAY (brief)
     */
    fun teachersToday(): List<TeacherTodayDto> = transaction {

        Schedules
            .innerJoin(Teachers)
            .slice(
                Teachers.firstName,
                Teachers.lastName,
                Schedules.timeStart,
                Schedules.timeEnd
            )
            .select { Schedules.dayOfWeek eq today() }
            .map {
                TeacherTodayDto(
                    teacherName = "${it[Teachers.firstName]} ${it[Teachers.lastName]}",
                    timeWindow = "${it[Schedules.timeStart]} - ${it[Schedules.timeEnd]}"
                )
            }
    }

    /**
     * Teachers with classes NOW (detailed)
     */
    fun teachersNow(): List<TeacherNowDto> = transaction {

        val current = now()

        Schedules
            .innerJoin(Teachers)
            .innerJoin(Rooms)
            .slice(
                Teachers.firstName,
                Teachers.lastName,
                Schedules.subjectName,
                Schedules.courseCode,
                Schedules.section,
                Rooms.name,
                Schedules.timeStart,
                Schedules.timeEnd
            )
            .select {
                (Schedules.dayOfWeek eq today()) and
                        (Schedules.timeStart lessEq current) and
                        (Schedules.timeEnd greater current)
            }
            .map {
                TeacherNowDto(
                    teacherName = "${it[Teachers.firstName]} ${it[Teachers.lastName]}",
                    subject = it[Schedules.subjectName],
                    section = "${it[Schedules.courseCode]}-${it[Schedules.section]}",
                    room = it[Rooms.name],
                    timeWindow = "${it[Schedules.timeStart]} - ${it[Schedules.timeEnd]}"
                )
            }
    }
}
