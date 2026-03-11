package zeroday.Queries.Settings

import zeroday.Models.db.tables.Courses
import zeroday.Models.dto.course.CourseRequest
import zeroday.Models.dto.course.CourseResponse
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.UUID

object CourseRepository {

    fun create(req: CourseRequest): UUID {
        val id = UUID.randomUUID()
        transaction {
            Courses.insert {
                it[Courses.id] = id
                it[code] = req.code.uppercase()
                it[name] = req.name
                it[levelType] = req.levelType
            it[department] = req.department.trim().uppercase()
            }
        }
        return id
    }

    fun findAll(): List<CourseResponse> = transaction {
        Courses.selectAll().map {
            CourseResponse(
                id = it[Courses.id].toString(),
                code = it[Courses.code],
                name = it[Courses.name],
                levelType = it[Courses.levelType],
                department = it[Courses.department],
                active = it[Courses.active]
            )
        }
    }

    fun update(id: UUID, req: CourseRequest) = transaction {
        Courses.update({ Courses.id eq id }) {
            it[code] = req.code.uppercase()
            it[name] = req.name
            it[levelType] = req.levelType
            it[department] = req.department.trim().uppercase()
        }
    }

    fun setActive(id: UUID, active: Boolean) = transaction {
        Courses.update({ Courses.id eq id }) {
            it[Courses.active] = active
        }
    }

    fun deactivate(id: UUID) = transaction {
        Courses.update({ Courses.id eq id }) {
            it[active] = false
        }
    }
}
