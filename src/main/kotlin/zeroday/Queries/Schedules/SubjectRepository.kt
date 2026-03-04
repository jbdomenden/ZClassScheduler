package zeroday.Queries.Schedules

import org.jetbrains.exposed.sql.and
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import zeroday.Models.db.tables.Subjects
import zeroday.Models.dto.subject.SubjectRequest
import zeroday.Models.dto.subject.SubjectResponse
import java.util.UUID

object SubjectRepository {


    fun create(req: SubjectRequest): UUID {
        val id = UUID.randomUUID()
        transaction {
            Subjects.insert {
                it[Subjects.id] = id
                it[courseCode] = req.courseCode.uppercase()
                it[curriculumId] = req.curriculumId?.let(UUID::fromString)
                it[code] = req.code
                it[name] = req.name
                it[yearTerm] = req.yearTerm
            }
        }
        return id
    }


    fun findFiltered(
        courseCode: String,
        curriculumId: String?,
        yearTerm: String
    ): List<SubjectResponse> = transaction {
        Subjects.select {
            (Subjects.courseCode eq courseCode.uppercase()) and
                    (Subjects.yearTerm eq yearTerm) and
                    (Subjects.active eq true) and
                    (
                            if (curriculumId == null)
                                Subjects.curriculumId.isNull()
                            else
                                Subjects.curriculumId eq UUID.fromString(curriculumId)
                            )
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


    fun deactivate(id: UUID) = transaction {
        Subjects.update({ Subjects.id eq id }) {
            it[active] = false
        }
    }
}