package zeroday.Queries.Dashboard

import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.JoinType
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greater
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNotNull
import org.jetbrains.exposed.sql.SqlExpressionBuilder.isNull
import org.jetbrains.exposed.sql.SqlExpressionBuilder.lessEq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.AuditLogs
import zeroday.Models.db.tables.Rooms
import zeroday.Models.db.tables.Schedules
import zeroday.Models.db.tables.Teachers
import zeroday.Models.dto.dashboard.DashboardIncompleteScheduleItem
import zeroday.Models.dto.dashboard.DashboardRoomScheduleItem
import java.time.LocalTime
import java.time.format.DateTimeFormatter

object DashboardRepository {

    private val hhmm = DateTimeFormatter.ofPattern("HH:mm")

    fun activeSchedules(now: LocalTime, day: String): Int = transaction {
        Schedules.select {
            (Schedules.active eq true) and
            (Schedules.dayOfWeek eq day) and
                    (Schedules.timeStart lessEq now) and
                    (Schedules.timeEnd greater now)
        }.count().toInt()
    }

    fun activeRooms(now: LocalTime, day: String): Int = transaction {
        Schedules.slice(Schedules.roomId)
            .select {
                (Schedules.active eq true) and
                (Schedules.dayOfWeek eq day) and
                        (Schedules.timeStart lessEq now) and
                        (Schedules.timeEnd greater now)
            }
            .withDistinct()
            .count()
            .toInt()
    }

    fun activeTeachers(now: LocalTime, day: String): Int = transaction {
        Schedules.slice(Schedules.teacherId)
            .select {
                (Schedules.active eq true) and
                (Schedules.dayOfWeek eq day) and
                        (Schedules.timeStart lessEq now) and
                        (Schedules.timeEnd greater now)
            }
            .withDistinct()
            .count()
            .toInt()
    }

    fun schedulesToday(day: String): Int = transaction {
        Schedules.select { (Schedules.active eq true) and (Schedules.dayOfWeek eq day) }
            .count()
            .toInt()
    }

    fun mostCommonConflict(): String? = transaction {
        AuditLogs
            .slice(AuditLogs.message, AuditLogs.id.count())
            .select { AuditLogs.success eq false }
            .groupBy(AuditLogs.message)
            .orderBy(AuditLogs.id.count(), SortOrder.DESC)
            .limit(1)
            .map { it[AuditLogs.message] }
            .singleOrNull()
    }

    fun roomOverview(day: String): List<DashboardRoomScheduleItem> = transaction {
        // Show today's scheduled items across all schedulers (dept-agnostic).
        val join = Schedules
            .join(Rooms, JoinType.INNER, additionalConstraint = { Schedules.roomId eq Rooms.id })
            .join(Teachers, JoinType.LEFT, additionalConstraint = { Schedules.teacherId eq Teachers.id })

        join
            .select {
                (Schedules.active eq true) and
                        (Schedules.dayOfWeek eq day) and
                        Schedules.timeStart.isNotNull() and
                        Schedules.timeEnd.isNotNull()
            }
            .orderBy(Rooms.name to SortOrder.ASC, Schedules.timeStart to SortOrder.ASC)
            .map { row ->
                val start = row[Schedules.timeStart]!!
                val end = row[Schedules.timeEnd]!!
                val teacher = row[Schedules.teacherId]?.let {
                    "${row[Teachers.firstName]} ${row[Teachers.lastName]}".trim()
                } ?: "\u2014"

                DashboardRoomScheduleItem(
                    roomCode = row[Rooms.name],
                    startTime = start.format(hhmm),
                    endTime = end.format(hhmm),
                    subject = row[Schedules.subjectName],
                    section = row[Schedules.section],
                    teacher = teacher
                )
            }
    }

    fun incomplete(limit: Int = 200): List<DashboardIncompleteScheduleItem> = transaction {
        val join = Schedules
            .join(Rooms, JoinType.LEFT, additionalConstraint = { Schedules.roomId eq Rooms.id })
            .join(Teachers, JoinType.LEFT, additionalConstraint = { Schedules.teacherId eq Teachers.id })

        val missing = (Schedules.dayOfWeek.isNull()) or
                (Schedules.timeStart.isNull()) or
                (Schedules.timeEnd.isNull()) or
                (Schedules.roomId.isNull()) or
                (Schedules.teacherId.isNull())

        join
            .select { (Schedules.active eq true) and missing }
            .orderBy(Schedules.section to SortOrder.ASC, Schedules.subjectName to SortOrder.ASC)
            .limit(limit)
            .map { row ->
                val ts = row[Schedules.timeStart]
                val te = row[Schedules.timeEnd]
                val time = if (ts != null && te != null) "${ts.format(hhmm)} - ${te.format(hhmm)}" else null

                val teacher = row[Schedules.teacherId]?.let {
                    "${row[Teachers.firstName]} ${row[Teachers.lastName]}".trim()
                }
                val room = row[Schedules.roomId]?.let { row[Rooms.name] }

                DashboardIncompleteScheduleItem(
                    subject = row[Schedules.subjectName],
                    section = row[Schedules.section],
                    day = row[Schedules.dayOfWeek],
                    time = time,
                    teacher = teacher,
                    room = room
                )
            }
    }
}
