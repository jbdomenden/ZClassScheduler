
package zeroday.Queries.Schedules

import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Controller.service.ScheduleTimePolicy
import zeroday.Models.db.tables.Curriculums
import zeroday.Models.db.tables.Schedules
import zeroday.Models.db.tables.Subjects
import zeroday.Models.dto.schedule.TertiaryBlockResponse
import zeroday.Models.dto.schedule.TertiaryRowResponse
import zeroday.Queries.Settings.SchoolHoursRepository
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.*

object SchedulerNAMEI_Repository {

    private val formatter = DateTimeFormatter.ofPattern("HH:mm")

    private fun curriculumIdsForDept(dept: String): List<UUID> =
        Curriculums.slice(Curriculums.id)
            .select { (Curriculums.dept eq dept) and (Curriculums.active eq true) }
            .map { it[Curriculums.id] }

    fun listBlocks(): List<TertiaryBlockResponse> = transaction {
        val allowed = curriculumIdsForDept("TERTIARY_NAMEI")
        if (allowed.isEmpty()) return@transaction emptyList()

        val rows = Schedules.select { (Schedules.curriculumId inList allowed) }.toList()
        if (rows.isEmpty()) return@transaction emptyList()

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
                    val (ns, ne) = ScheduleTimePolicy.normalizeForReadOrReset(
                        s[Schedules.timeStart],
                        s[Schedules.timeEnd]
                    )
                    TertiaryRowResponse(
                        id = s[Schedules.id].toString(),
                        subjectId = s[Schedules.subjectId].toString(),
                        subjectCode = subjectCodeById[s[Schedules.subjectId]] ?: "",
                        subjectName = s[Schedules.subjectName],
                        isElective = s[Schedules.isElective],
                        dayOfWeek = s[Schedules.dayOfWeek],
                        timeStart = ns?.format(formatter),
                        timeEnd = ne?.format(formatter),
                        roomId = s[Schedules.roomId]?.toString(),
                        teacherId = s[Schedules.teacherId]?.toString(),
                        active = s[Schedules.active],
                        isDuplicateRow = s[Schedules.isDuplicateRow]
                    )
                }
            )
        }.sortedBy { it.sectionCode }
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
            it[Schedules.schoolYear] = base[Schedules.schoolYear]
            it[Schedules.academicTerm] = base[Schedules.academicTerm]
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
        val parsedStart = start?.trim()?.takeIf { it.isNotBlank() }?.let { LocalTime.parse(it) }
        val parsedEnd = end?.trim()?.takeIf { it.isNotBlank() }?.let { LocalTime.parse(it) }
        val (ns, ne) = ScheduleTimePolicy.normalizeStrictOrNull(parsedStart, parsedEnd)

        if (teacherId != null && day != null && ns != null && ne != null) {
            val dayNorm = day.trim().uppercase()
            if (TeacherBlockRepository.hasRestDayOverlap(teacherId, dayNorm, ns, ne)) {
                throw IllegalArgumentException("Cannot set schedule: teacher is on REST DAY for $dayNorm.")
            }
        }

        if (day != null && ns != null && ne != null) {
            val validationError = SchoolHoursRepository.validateSlot(day, ns, ne)
            if (validationError != null) throw IllegalArgumentException(validationError)
        }

        Schedules.update({ Schedules.id eq id }) {
            it[dayOfWeek] = day
            it[timeStart] = ns
            it[timeEnd] = ne
            it[Schedules.roomId] = roomId
            it[Schedules.teacherId] = teacherId
        }
    }

    fun deleteBlock(sectionCode: String) = transaction {
        Schedules.deleteWhere { Schedules.section eq sectionCode }
    }
}
