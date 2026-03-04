package zeroday.Queries.Schedules

import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.TeacherBlockType
import zeroday.Models.db.tables.TeacherBlocks
import java.time.LocalTime
import java.util.UUID

object TeacherBlockRepository {


    fun hasOverlap(
        teacherId: UUID,
        day: String,
        start: LocalTime,
        end: LocalTime
    ): Boolean = transaction {
        TeacherBlocks.select {
            (TeacherBlocks.teacherId eq teacherId) and
                    (TeacherBlocks.dayOfWeek eq day) and
                    ((TeacherBlocks.timeStart less end) and (TeacherBlocks.timeEnd greater start))
        }.any()
    }


    fun create(
        teacherId: UUID,
        type: TeacherBlockType,
        day: String,
        start: LocalTime,
        end: LocalTime
    ) = transaction {
        TeacherBlocks.insert {
            it[id] = UUID.randomUUID()
            it[TeacherBlocks.teacherId] = teacherId
            it[TeacherBlocks.type] = type
            it[dayOfWeek] = day
            it[timeStart] = start
            it[timeEnd] = end
        }
    }
}