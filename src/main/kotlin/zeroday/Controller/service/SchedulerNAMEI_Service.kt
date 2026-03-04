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

object SchedulerNAMEI_Service {

    private fun levelIndex(year: Int, term: Int): Int = (year - 1) * 2 + term // 1..8

    private fun validateInputs(courseCode: String, year: Int, term: Int) {
        if (courseCode.trim().isBlank()) throw IllegalArgumentException("Program/Course is required.")
        if (year !in 1..4) throw IllegalArgumentException("Year must be 1..4.")
        if (term !in 1..2) throw IllegalArgumentException("Term must be 1..2.")
    }

    fun createBlock(courseCode: String, curriculumId: UUID, year: Int, term: Int): String = transaction {
        validateInputs(courseCode, year, term)

        val curriculum = Curriculums.select { Curriculums.id eq curriculumId }.singleOrNull()
            ?: throw IllegalArgumentException("Curriculum not found.")

        if (curriculum[Curriculums.dept] != "TERTIARY_NAMEI") {
            throw IllegalArgumentException("Selected curriculum is not under NAMEI department.")
        }

        val normalizedCourse = courseCode.trim().uppercase()
        val level = levelIndex(year, term)
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

        if (subjects.isEmpty()) throw IllegalStateException("No subjects found for the selected Year/Term.")

        subjects.forEach { (subjectId, _, subjectName) ->
            Schedules.insert {
                it[id] = UUID.randomUUID()
                it[Schedules.courseCode] = normalizedCourse
                it[Schedules.section] = sectionCode
                it[Schedules.curriculumId] = curriculumId
                it[Schedules.subjectId] = subjectId
                it[Schedules.sectionName] = curriculumLabel
                it[Schedules.subjectName] = subjectName
                it[Schedules.year] = year
                it[Schedules.term] = term
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
