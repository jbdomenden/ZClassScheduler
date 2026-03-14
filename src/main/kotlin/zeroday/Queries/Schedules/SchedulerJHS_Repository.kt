package zeroday.Queries.Schedules

import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Controller.service.ScheduleTimePolicy
import zeroday.Models.db.tables.Curriculums
import zeroday.Models.db.tables.Schedules
import zeroday.Models.db.tables.Subjects
import zeroday.Models.dto.schedule.JhsBlockResponse
import zeroday.Models.dto.schedule.JhsRowResponse
import zeroday.Queries.Settings.SchoolHoursRepository
import java.time.LocalTime
import java.time.format.DateTimeFormatter
import java.util.*

object SchedulerJHS_Repository {

    /**
     * Mapping used for JHS:
     * Grade 7  -> Subjects.yearTerm = "1"
     * Grade 8  -> Subjects.yearTerm = "2"
     * Grade 9  -> Subjects.yearTerm = "3"
     * Grade 10 -> Subjects.yearTerm = "4"
     */
    private fun gradeToYearTerm(grade: Int): String = when (grade) {
        7 -> "1"
        8 -> "2"
        9 -> "3"
        10 -> "4"
        else -> grade.toString()
    }

    private fun renderSection(grade: Int, sectionName: String): String {
        val clean = sectionName.trim().replace(Regex("\\s+"), " ")
        // UI wants grade + section name
        return "G$grade-$clean"
    }

    private val fmt24 = DateTimeFormatter.ofPattern("H:mm")
    private val fmt12 = DateTimeFormatter.ofPattern("h:mm a")
    private val fmtGrid = DateTimeFormatter.ofPattern("HH:mm")

    private fun parseTimeOrNull(v: String?): LocalTime? {
        val s = v?.trim().orEmpty()
        if (s.isBlank() || s == "—" || s == "-") return null
        return runCatching {
            if (s.contains("AM", true) || s.contains("PM", true)) LocalTime.parse(s.uppercase(), fmt12)
            else LocalTime.parse(s, fmt24)
        }.getOrNull()
    }

    fun listBlocks(): List<JhsBlockResponse> = transaction {
        // Explicit join constraints (no FK refs declared in Exposed tables)
        val join = Schedules
            .join(Curriculums, JoinType.INNER, additionalConstraint = { Schedules.curriculumId eq Curriculums.id })
            .join(Subjects, JoinType.INNER, additionalConstraint = { Schedules.subjectId eq Subjects.id })

        val activePeriod = SchoolHoursRepository.getActivePeriod() ?: return@transaction emptyList()

        val rows = join
            .select {
                (Curriculums.dept eq "JHS") and
                        Curriculums.active.eq(true) and
                        Schedules.active.eq(true) and
                        (Schedules.schoolYear eq activePeriod.schoolYear)
            }
            .orderBy(
                Schedules.section to SortOrder.ASC,
                Schedules.year to SortOrder.ASC,
                Subjects.code to SortOrder.ASC,
                Schedules.isDuplicateRow to SortOrder.ASC
            )
            .toList()

        val grouped = rows.groupBy {
            it[Schedules.section] to it[Schedules.year]
        }

        grouped.map { (k, items) ->
            val (section, grade) = k
            val first = items.first()

            JhsBlockResponse(
                section = section,
                grade = grade,
                curriculumName = first[Curriculums.name],
                program = first[Curriculums.courseCode],
                status = if (first[Schedules.active]) "Active" else "Inactive",
                rows = items.map { it.toRowDto() }
            )
        }.sortedWith(compareBy({ it.section }, { it.grade }))
    }

    fun createBlock(curriculumId: UUID, grade: Int, sectionName: String) = transaction {
        val activePeriod = SchoolHoursRepository.getActivePeriod()
            ?: throw IllegalStateException("No active school year and term configured. Please contact SUPER_ADMIN or ACADEMIC_HEAD.")

        val cur = Curriculums
            .select { Curriculums.id eq curriculumId }
            .singleOrNull()
            ?: throw IllegalArgumentException("Curriculum not found")

        val dept = cur[Curriculums.dept].uppercase()
        if (dept != "JHS") throw IllegalArgumentException("Curriculum is not JHS")

        val renderedSection = renderSection(grade, sectionName)

        // prevent duplicates for same section+grade
        val exists = Schedules.select {
            (Schedules.section eq renderedSection) and (Schedules.year eq grade)
        }.limit(1).any()

        if (exists) throw IllegalStateException("Section already exists")

        val yt = gradeToYearTerm(grade)

        val subjects = Subjects
            .select {
                (Subjects.curriculumId eq curriculumId) and
                        (Subjects.yearTerm eq yt) and
                        Subjects.active.eq(true)
            }
            .orderBy(Subjects.code to SortOrder.ASC)
            .toList()

        if (subjects.isEmpty()) throw IllegalStateException("No subjects found for Grade $grade")

        val courseCode = cur[Curriculums.courseCode]

        subjects.forEach { s ->
            Schedules.insert {
                it[id] = UUID.randomUUID()

                it[Schedules.courseCode] = courseCode
                it[Schedules.section] = renderedSection
                it[Schedules.sectionName] = sectionName.trim()

                it[Schedules.curriculumId] = curriculumId
                it[Schedules.subjectId] = s[Subjects.id]
                it[Schedules.subjectName] = s[Subjects.name]

                // JHS: store grade in year
                it[Schedules.year] = grade
                it[Schedules.term] = 1
                it[Schedules.schoolYear] = activePeriod.schoolYear
                it[Schedules.academicTerm] = activePeriod.term
                it[Schedules.levelIndex] = 1
                it[Schedules.isElective] = false

                it[Schedules.dayOfWeek] = null
                it[Schedules.timeStart] = null
                it[Schedules.timeEnd] = null
                it[Schedules.roomId] = null
                it[Schedules.teacherId] = null

                it[Schedules.isDuplicateRow] = false
                it[Schedules.active] = true
            }
        }
    }

    fun deleteBlock(section: String) = transaction {
        Schedules.deleteWhere { Schedules.section eq section }
    }

    fun duplicateRow(baseId: UUID): UUID = transaction {
        val base = Schedules
            .select { Schedules.id eq baseId }
            .singleOrNull()
            ?: throw IllegalArgumentException("Base row not found")

        val newId = UUID.randomUUID()

        Schedules.insert {
            it[id] = newId

            it[Schedules.courseCode] = base[Schedules.courseCode]
            it[Schedules.section] = base[Schedules.section]
            it[Schedules.sectionName] = base[Schedules.sectionName]

            it[Schedules.curriculumId] = base[Schedules.curriculumId]
            it[Schedules.subjectId] = base[Schedules.subjectId]
            it[Schedules.subjectName] = base[Schedules.subjectName]

            it[Schedules.year] = base[Schedules.year]
            it[Schedules.term] = base[Schedules.term]
            it[Schedules.schoolYear] = base[Schedules.schoolYear]
            it[Schedules.academicTerm] = base[Schedules.academicTerm]
            it[Schedules.levelIndex] = base[Schedules.levelIndex]
            it[Schedules.isElective] = base[Schedules.isElective]

            it[Schedules.dayOfWeek] = null
            it[Schedules.timeStart] = null
            it[Schedules.timeEnd] = null
            it[Schedules.roomId] = null
            it[Schedules.teacherId] = null

            it[Schedules.isDuplicateRow] = true
            it[Schedules.active] = true
        }

        newId
    }

    fun deleteDuplicateRow(id: UUID): Boolean = transaction {
        Schedules.deleteWhere {
            (Schedules.id eq id) and (Schedules.isDuplicateRow eq true)
        } > 0
    }

    fun updateRow(
        id: UUID,
        day: String?,
        start: String?,
        end: String?,
        roomId: UUID?,
        teacherId: UUID?
    ) = transaction {
        val parsedStart = parseTimeOrNull(start)
        val parsedEnd = parseTimeOrNull(end)
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
            it[Schedules.dayOfWeek] = day
            it[Schedules.timeStart] = ns
            it[Schedules.timeEnd] = ne
            it[Schedules.roomId] = roomId
            it[Schedules.teacherId] = teacherId
        }
    }

    private fun ResultRow.toRowDto(): JhsRowResponse {
        val (ns, ne) = ScheduleTimePolicy.normalizeForReadOrReset(this[Schedules.timeStart], this[Schedules.timeEnd])

        return JhsRowResponse(
            id = this[Schedules.id].toString(),
            subjectCode = runCatching { this[Subjects.code] }.getOrNull().orEmpty(),
            subjectName = (runCatching { this[Subjects.name] }.getOrNull() ?: this[Schedules.subjectName]),
            dayOfWeek = this[Schedules.dayOfWeek],
            timeStart = ns?.format(fmtGrid),
            timeEnd = ne?.format(fmtGrid),
            roomId = this[Schedules.roomId]?.toString(),
            teacherId = this[Schedules.teacherId]?.toString(),
            isDuplicateRow = this[Schedules.isDuplicateRow]
        )
    }
}
