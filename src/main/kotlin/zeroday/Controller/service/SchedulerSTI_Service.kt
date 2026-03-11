package zeroday.Controller.service

import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.Curriculums
import zeroday.Models.db.tables.Schedules
import zeroday.Models.db.tables.Subjects
import java.util.UUID
import zeroday.Queries.Settings.SchoolHoursRepository

/**
 * STI Tertiary schedule block creation.
 *
 * Section format (required): BB123
 * - BB  : course code (Manage Courses / wizard Program)
 * - 1   : levelIndex mapping (1..8)
 * - 23  : section count (01, 02, 03 ...)
 */
object SchedulerSTI_Service {

    private fun levelIndex(year: Int, term: Int): Int = (year - 1) * 2 + term // 1..8

    private fun validateInputs(courseCode: String, year: Int, term: Int) {
        if (courseCode.trim().isBlank()) throw IllegalArgumentException("Program/Course is required.")
        if (year !in 1..4) throw IllegalArgumentException("Year must be 1..4.")
        if (term !in 1..2) throw IllegalArgumentException("Term must be 1..2.")
    }

    fun createBlock(courseCode: String, curriculumId: UUID, year: Int, term: Int): String = transaction {
        validateInputs(courseCode, year, term)

        val activePeriod = SchoolHoursRepository.getActivePeriod()
            ?: throw IllegalStateException("No active school year and term configured. Please contact SUPER_ADMIN or ACADEMIC_HEAD.")

        val normalizedCourse = courseCode.trim().uppercase()
        val level = levelIndex(year, term)

        // Prefix is {COURSE}{LEVEL}
        val prefix = "$normalizedCourse$level"

        // Existing sections for same course -> find max COUNT
        val existingSections = Schedules
            .slice(Schedules.section)
            .select { Schedules.courseCode eq normalizedCourse }
            .map { it[Schedules.section] }
            .distinct()

        val maxCount = existingSections
            .filter { it.startsWith(prefix) }
            .mapNotNull { it.removePrefix(prefix).toIntOrNull() }
            .maxOrNull() ?: 0

        val nextCount = maxCount + 1
        val sectionCode = prefix + nextCount.toString().padStart(2, '0') // ✅ 01, 02, ...

        // Curriculum label (shown under section code)
        val curriculumLabel = Curriculums
            .select { Curriculums.id eq curriculumId }
            .singleOrNull()
            ?.get(Curriculums.name)
            ?: ""

        // Pull curriculum subjects for selected year/term levelIndex
        val subjects = Subjects
            .select {
                (Subjects.curriculumId eq curriculumId) and
                        (Subjects.yearTerm eq level.toString()) and
                        (Subjects.active eq true)
            }
            .orderBy(Subjects.code to SortOrder.ASC)
            .map {
                Triple(
                    it[Subjects.id],
                    it[Subjects.code],
                    it[Subjects.name]
                )
            }

        // Do NOT create empty blocks (they will not render)
        if (subjects.isEmpty()) {
            throw IllegalStateException(
                "No subjects found for the selected Curriculum / Year / Term. " +
                        "Expected subjects.yearTerm = \"$level\" for this curriculum."
            )
        }

        // Insert schedule rows (nullable day/time/room/teacher)
        subjects.forEach { (subjectId, _subjectCode, subjectName) ->
            Schedules.insert {
                it[Schedules.id] = UUID.randomUUID()
                it[Schedules.courseCode] = normalizedCourse
                it[Schedules.section] = sectionCode
                it[Schedules.curriculumId] = curriculumId
                it[Schedules.subjectId] = subjectId

                it[Schedules.sectionName] = curriculumLabel
                it[Schedules.subjectName] = subjectName

                it[Schedules.year] = year
                it[Schedules.term] = term
                it[Schedules.schoolYear] = activePeriod.schoolYear
                it[Schedules.academicTerm] = activePeriod.term
                it[Schedules.levelIndex] = level

                it[Schedules.isElective] = false
                it[Schedules.isDuplicateRow] = false
                it[Schedules.active] = true

                // ✅ nullable fields
                it[Schedules.teacherId] = null
                it[Schedules.roomId] = null
                it[Schedules.dayOfWeek] = null
                it[Schedules.timeStart] = null
                it[Schedules.timeEnd] = null
            }
        }

        sectionCode
    }
}