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

object SchedulerSHS_Service {

    private fun levelIndex(grade: Int, term: Int): Int = (grade - 11) * 2 + term // 1..4

    private fun validateInputs(courseCode: String, grade: Int, term: Int) {
        if (courseCode.trim().isBlank()) throw IllegalArgumentException("Strand/Program is required.")
        if (grade !in 11..12) throw IllegalArgumentException("Grade must be 11 or 12.")
        if (term !in 1..2) throw IllegalArgumentException("Term must be 1..2.")
    }

    fun createBlock(courseCode: String, curriculumId: UUID, grade: Int, term: Int): String = transaction {
        validateInputs(courseCode, grade, term)

        val activePeriod = SchoolHoursRepository.getActivePeriod()
            ?: throw IllegalStateException("No active school year and term configured. Please contact SUPER_ADMIN or ACADEMIC_HEAD.")

        val curriculum = Curriculums.select { Curriculums.id eq curriculumId }.singleOrNull()
            ?: throw IllegalArgumentException("Curriculum not found.")

        if (curriculum[Curriculums.dept] != "SHS") {
            throw IllegalArgumentException("Selected curriculum is not under SHS department.")
        }

        val normalizedCourse = courseCode.trim().uppercase()
        val level = levelIndex(grade, term)
        val prefix = "$normalizedCourse$level"

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
        val sectionCode = prefix + nextCount.toString().padStart(2, '0')

        val curriculumLabel = curriculum[Curriculums.name]

        val subjects = Subjects
            .select {
                (Subjects.curriculumId eq curriculumId) and
                        (Subjects.yearTerm eq level.toString()) and
                        (Subjects.active eq true)
            }
            .orderBy(Subjects.code to SortOrder.ASC)
            .map { Triple(it[Subjects.id], it[Subjects.code], it[Subjects.name]) }

        if (subjects.isEmpty()) throw IllegalStateException("No subjects found for the selected Grade/Term.")

        subjects.forEach { (subjectId, _, subjectName) ->
            Schedules.insert {
                it[id] = UUID.randomUUID()
                it[Schedules.courseCode] = normalizedCourse
                it[Schedules.section] = sectionCode
                it[Schedules.curriculumId] = curriculumId
                it[Schedules.subjectId] = subjectId
                it[Schedules.sectionName] = curriculumLabel
                it[Schedules.subjectName] = subjectName

                // reuse schedules.year as grade for SHS
                it[Schedules.year] = grade
                it[Schedules.term] = term
                it[Schedules.schoolYear] = activePeriod.schoolYear
                it[Schedules.academicTerm] = activePeriod.term
                it[Schedules.levelIndex] = level

                it[Schedules.isElective] = false
                it[Schedules.isDuplicateRow] = false
                it[Schedules.active] = true

                it[Schedules.dayOfWeek] = null
                it[Schedules.timeStart] = null
                it[Schedules.timeEnd] = null
                it[Schedules.roomId] = null
                it[Schedules.teacherId] = null
            }
        }

        sectionCode
    }
}
