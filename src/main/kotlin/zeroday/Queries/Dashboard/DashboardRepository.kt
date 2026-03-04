package zeroday.Queries.Dashboard

import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.count
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.AuditLogs
import zeroday.Models.db.tables.Schedules
import java.time.LocalTime

object DashboardRepository {

    fun activeSchedules(now: LocalTime, day: String): Int = transaction {
        Schedules.select {
            (Schedules.dayOfWeek eq day) and
                    (Schedules.timeStart lessEq now) and
                    (Schedules.timeEnd greater now)
        }.count().toInt()
    }

    fun activeRooms(now: LocalTime, day: String): Int = transaction {
        Schedules.slice(Schedules.roomId)
            .select {
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
                (Schedules.dayOfWeek eq day) and
                        (Schedules.timeStart lessEq now) and
                        (Schedules.timeEnd greater now)
            }
            .withDistinct()
            .count()
            .toInt()
    }

    fun schedulesToday(day: String): Int = transaction {
        Schedules.select { Schedules.dayOfWeek eq day }
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
}