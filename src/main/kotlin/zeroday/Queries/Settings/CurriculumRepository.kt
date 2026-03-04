package zeroday.Queries.Settings

import zeroday.Models.db.tables.Curriculums
import zeroday.Models.db.tables.Subjects
import zeroday.Models.dto.curriculum.CurriculumRequest
import zeroday.Models.dto.curriculum.CurriculumResponse
import zeroday.Models.dto.subject.SubjectResponse
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.UUID

object CurriculumRepository {

    private fun normalizeDept(raw: String?): String {
        val v = (raw ?: "").trim().uppercase()
        return when (v) {
            "TERTIARY_STI" -> "TERTIARY_STI"
            "TERTIARY_NAMEI" -> "TERTIARY_NAMEI"
            "JHS" -> "JHS"
            "SHS" -> "SHS"
            else -> "TERTIARY_STI"
        }
    }

    fun create(req: CurriculumRequest): UUID {
        val id = UUID.randomUUID()
        transaction {
            Curriculums.insert {
                it[Curriculums.id] = id
                it[Curriculums.courseCode] = req.courseCode.uppercase()
                it[Curriculums.name] = req.name
                it[Curriculums.dept] = normalizeDept(req.dept)
            }
        }
        return id
    }

    fun findByCourse(courseCode: String): List<CurriculumResponse> = transaction {
        Curriculums.select {
            (Curriculums.courseCode eq courseCode.uppercase()) and (Curriculums.active eq true)
        }.map {
            CurriculumResponse(
                id = it[Curriculums.id].toString(),
                courseCode = it[Curriculums.courseCode],
                name = it[Curriculums.name],
                dept = it[Curriculums.dept],
                active = it[Curriculums.active]
            )
        }
    }

    fun deactivate(id: UUID) = transaction {
        Curriculums.update({ Curriculums.id eq id }) {
            it[active] = false
        }
    }

    fun setActive(id: UUID, active: Boolean) = transaction {
        Curriculums.update({ Curriculums.id eq id }) {
            it[Curriculums.active] = active
        }
    }

    fun listAll(courseCode: String? = null): List<CurriculumResponse> = transaction {
        val q: Query = if (courseCode.isNullOrBlank()) {
            Curriculums.selectAll()
        } else {
            Curriculums.select { Curriculums.courseCode eq courseCode.uppercase() }
        }

        q.map {
            CurriculumResponse(
                id = it[Curriculums.id].toString(),
                courseCode = it[Curriculums.courseCode],
                name = it[Curriculums.name],
                dept = it[Curriculums.dept],
                active = it[Curriculums.active]
            )
        }
    }

    fun subjectsForCurriculum(curriculumId: String): List<SubjectResponse> = transaction {
        val cid = UUID.fromString(curriculumId)

        Subjects.select {
            (Subjects.curriculumId eq cid) and (Subjects.active eq true)
        }.map {
            SubjectResponse(
                id = it[Subjects.id].toString(),
                courseCode = it[Subjects.courseCode],
                curriculumId = it[Subjects.curriculumId]?.toString(),
                code = it[Subjects.code],
                name = it[Subjects.name],
                yearTerm = it[Subjects.yearTerm],
                active = it[Subjects.active]
            )
        }
    }

    /** HARD DELETE: removes curriculum row and its subjects permanently. */
    fun hardDelete(id: UUID) = transaction {
        Subjects.deleteWhere { Subjects.curriculumId eq id }
        Curriculums.deleteWhere { Curriculums.id eq id }
    }
}
