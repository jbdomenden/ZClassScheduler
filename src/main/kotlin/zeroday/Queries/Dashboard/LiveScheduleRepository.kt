package zeroday.Queries.Dashboard

import org.jetbrains.exposed.sql.ResultRow
import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.Rooms
import zeroday.Models.db.tables.Schedules
import zeroday.Models.db.tables.Teachers
import zeroday.Models.dto.schedule.ScheduleLiveItem
import java.time.LocalTime

object LiveScheduleRepository {

    fun now(day: String, now: LocalTime): List<ScheduleLiveItem> = transaction {
        Schedules
            .innerJoin(Rooms)
            .innerJoin(Teachers)
            .select {
                (Schedules.dayOfWeek eq day) and
                        (Schedules.timeStart lessEq now) and
                        (Schedules.timeEnd greater now)
            }
            .map { it.toLiveItem() }
    }

    fun next(day: String, now: LocalTime): List<ScheduleLiveItem> = transaction {
        Schedules
            .innerJoin(Rooms)
            .innerJoin(Teachers)
            .select {
                (Schedules.dayOfWeek eq day) and
                        (Schedules.timeStart greater now)
            }
            .orderBy(Schedules.timeStart to SortOrder.ASC)
            .limit(5)
            .map { it.toLiveItem() }
    }

    fun upcoming(day: String, now: LocalTime): List<ScheduleLiveItem> = transaction {
        Schedules
            .innerJoin(Rooms)
            .innerJoin(Teachers)
            .select {
                (Schedules.dayOfWeek eq day) and
                        (Schedules.timeStart greater now)
            }
            .orderBy(Schedules.timeStart to SortOrder.ASC)
            .map { it.toLiveItem() }
    }

    private fun ResultRow.toLiveItem() = ScheduleLiveItem(
        scheduleId = this[Schedules.id].toString(),
        courseCode = this[Schedules.courseCode],
        section = this[Schedules.section],
        roomName = this[Rooms.name],
        teacherName = "${this[Teachers.firstName]} ${this[Teachers.lastName]}",
        timeStart = this[Schedules.timeStart].toString(),
        timeEnd = this[Schedules.timeEnd].toString()
    )
}