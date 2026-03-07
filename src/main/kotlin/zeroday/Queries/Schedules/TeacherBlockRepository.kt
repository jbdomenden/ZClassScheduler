package zeroday.Queries.Schedules

import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greater
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.deleteWhere
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

    fun listByTeacher(teacherId: UUID) = transaction {
        TeacherBlocks
            .select { TeacherBlocks.teacherId eq teacherId }
            .map {
                mapOf(
                    "id" to it[TeacherBlocks.id].toString(),
                    "teacherId" to it[TeacherBlocks.teacherId].toString(),
                    "type" to it[TeacherBlocks.type].name,
                    "dayOfWeek" to it[TeacherBlocks.dayOfWeek],
                    "timeStart" to it[TeacherBlocks.timeStart].toString(),
                    "timeEnd" to it[TeacherBlocks.timeEnd].toString(),
                )
            }
    }

    fun findById(id: UUID): Map<String, Any?>? = transaction {
        TeacherBlocks
            .select { TeacherBlocks.id eq id }
            .limit(1)
            .singleOrNull()
            ?.let {
                mapOf(
                    "id" to it[TeacherBlocks.id].toString(),
                    "teacherId" to it[TeacherBlocks.teacherId].toString(),
                    "type" to it[TeacherBlocks.type].name,
                    "dayOfWeek" to it[TeacherBlocks.dayOfWeek],
                    "timeStart" to it[TeacherBlocks.timeStart].toString(),
                    "timeEnd" to it[TeacherBlocks.timeEnd].toString(),
                )
            }
    }

    fun delete(id: UUID): Int = transaction {
        TeacherBlocks.deleteWhere { TeacherBlocks.id eq id }
    }
}
