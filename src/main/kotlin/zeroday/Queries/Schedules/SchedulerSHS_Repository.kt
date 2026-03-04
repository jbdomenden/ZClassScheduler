
package zeroday.Queries.Schedules

import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.deleteWhere
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.jetbrains.exposed.sql.insert
import zeroday.Models.db.tables.Curriculums
import zeroday.Models.db.tables.Schedules
import zeroday.Models.db.tables.Subjects
import zeroday.Models.dto.schedule.TertiaryBlockResponse
import zeroday.Models.dto.schedule.TertiaryRowResponse
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.UUID

object SchedulerSHS_Repository {

    private val formatter = DateTimeFormatter.ofPattern("HH:mm")

    private fun curriculumIdsForDept(dept: String): List<UUID> =
        Curriculums.slice(Curriculums.id)
            .select { (Curriculums.dept eq dept) and (Curriculums.active eq true) }
            .map { it[Curriculums.id] }

    fun listBlocks(): List<TertiaryBlockResponse> = transaction {
        val allowed = curriculumIdsForDept("SHS")
        if (allowed.isEmpty()) return@transaction emptyList()

        val rows = Schedules.select { (Schedules.curriculumId inList allowed) }.toList()

        val subjectIds = rows.map { it[Schedules.subjectId] }.distinct()
        val subjectCodeById = Subjects
            .select { Subjects.id inList subjectIds }
            .associate { it[Subjects.id] to it[Subjects.code] }

        val grouped = rows.groupBy { it[Schedules.section] }

        grouped.map { (sectionCode, schedules) ->
            val first = schedules.first()
            val curriculumId = first[Schedules.curriculumId]

            val curriculumName = curriculumId?.let {
                Curriculums.select { Curriculums.id eq it }
                    .singleOrNull()
                    ?.get(Curriculums.name)
            }

            TertiaryBlockResponse(
                sectionCode = sectionCode,
                courseCode = first[Schedules.courseCode],
                curriculumId = curriculumId?.toString(),
                curriculumName = curriculumName,
                year = first[Schedules.year],
                term = first[Schedules.term],
                levelIndex = first[Schedules.levelIndex],
                active = first[Schedules.active],
                rows = schedules.map { s ->
                    TertiaryRowResponse(
                        id = s[Schedules.id].toString(),
                        subjectId = s[Schedules.subjectId].toString(),
                        subjectCode = subjectCodeById[s[Schedules.subjectId]] ?: "",
                        subjectName = s[Schedules.subjectName],
                        isElective = s[Schedules.isElective],
                        dayOfWeek = s[Schedules.dayOfWeek],
                        timeStart = s[Schedules.timeStart]?.format(formatter),
                        timeEnd = s[Schedules.timeEnd]?.format(formatter),
                        roomId = s[Schedules.roomId]?.toString(),
                        teacherId = s[Schedules.teacherId]?.toString(),
                        active = s[Schedules.active]
                    )
                }
            )
        }
    }

    fun duplicateRow(baseId: UUID): UUID = transaction {
        val base = Schedules.select { Schedules.id eq baseId }.singleOrNull()
            ?: throw IllegalArgumentException("Base row not found")

        val newId = UUID.randomUUID()

        Schedules.insert {
            it[id] = newId
            it[courseCode] = base[Schedules.courseCode]
            it[section] = base[Schedules.section]
            it[curriculumId] = base[Schedules.curriculumId]
            it[subjectId] = base[Schedules.subjectId]
            it[sectionName] = base[Schedules.sectionName]
            it[subjectName] = base[Schedules.subjectName]
            it[year] = base[Schedules.year]
            it[term] = base[Schedules.term]
            it[levelIndex] = base[Schedules.levelIndex]
            it[isElective] = base[Schedules.isElective]
            it[isDuplicateRow] = true
            it[active] = base[Schedules.active]

            it[dayOfWeek] = null
            it[timeStart] = null
            it[timeEnd] = null
            it[roomId] = null
            it[teacherId] = null
        }

        newId
    }

    fun deleteDuplicateRow(id: UUID): Boolean = transaction {
        Schedules.deleteWhere { (Schedules.id eq id) and (Schedules.isDuplicateRow eq true) } > 0
    }

    fun updateRow(
        id: UUID,
        day: String?,
        start: String?,
        end: String?,
        roomId: UUID?,
        teacherId: UUID?
    ) = transaction {
        Schedules.update({ Schedules.id eq id }) {
            it[dayOfWeek] = day
            it[timeStart] = start?.let { LocalTime.parse(it) }
            it[timeEnd] = end?.let { LocalTime.parse(it) }
            it[Schedules.roomId] = roomId
            it[Schedules.teacherId] = teacherId
        }
    }

    fun deleteBlock(sectionCode: String) = transaction {
        Schedules.deleteWhere { Schedules.section eq sectionCode }
    }
}
