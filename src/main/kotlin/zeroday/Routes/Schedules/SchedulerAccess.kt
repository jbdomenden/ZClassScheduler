package zeroday.Routes.Schedules

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.respond
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Controller.auth.JwtClaims
import zeroday.Controller.auth.RoleCatalog
import zeroday.Models.db.tables.Courses
import zeroday.Models.db.tables.Curriculums
import zeroday.Models.db.tables.Schedules
import zeroday.Queries.Settings.TeacherRepository
import java.util.UUID

private fun parseDepartments(raw: String?): Set<String> =
    (raw ?: "").split(',', ';', '|').map { it.trim().uppercase() }.filter { it.isNotEmpty() }.toSet()

private fun lookupCourseDepartments(courseCode: String): Set<String> = transaction {
    Courses.select { Courses.code eq courseCode.uppercase() }
        .limit(1)
        .singleOrNull()
        ?.let { parseDepartments(it[Courses.department]) }
        ?: emptySet()
}

private fun lookupTargetBySection(sectionCode: String): Pair<String, String>? = transaction {
    val row = Schedules.select { Schedules.section eq sectionCode }.limit(1).singleOrNull() ?: return@transaction null
    val course = row[Schedules.courseCode]
    val dept = row[Schedules.curriculumId]?.let { cid ->
        Curriculums.select { Curriculums.id eq cid }.limit(1).singleOrNull()?.get(Curriculums.dept)
    } ?: ""
    course to dept.uppercase()
}

private fun lookupTargetByRowId(rowId: UUID): Pair<String, String>? = transaction {
    val row = Schedules.select { Schedules.id eq rowId }.limit(1).singleOrNull() ?: return@transaction null
    val course = row[Schedules.courseCode]
    val dept = row[Schedules.curriculumId]?.let { cid ->
        Curriculums.select { Curriculums.id eq cid }.limit(1).singleOrNull()?.get(Curriculums.dept)
    } ?: ""
    course to dept.uppercase()
}

private fun isHsDept(curriculumDept: String): Boolean = curriculumDept == "SHS" || curriculumDept == "JHS"
private fun isTertiaryDept(curriculumDept: String): Boolean = curriculumDept == "TERTIARY_STI" || curriculumDept == "TERTIARY_NAMEI"

private fun isAllowedByPolicy(claims: JwtClaims, courseCode: String, curriculumDept: String): Boolean {
    val role = RoleCatalog.normalize(claims.role)
    if (role in RoleCatalog.topLevel) return true
    if (role !in RoleCatalog.adminLike) return false

    if (isHsDept(curriculumDept)) return role == RoleCatalog.ASSISTANT_PRINCIPAL

    val userDepts = parseDepartments(TeacherRepository.findDepartmentByEmail(claims.email ?: ""))
    if (isTertiaryDept(curriculumDept) && userDepts.contains("GE")) return true

    val courseDepts = lookupCourseDepartments(courseCode)
    if (courseDepts.isEmpty()) return false
    return userDepts.any { it in courseDepts }
}

suspend fun ApplicationCall.requireSchedulerWriteAccessBySection(claims: JwtClaims, sectionCode: String): Boolean {
    val target = lookupTargetBySection(sectionCode)
    if (target == null) {
        respond(HttpStatusCode.NotFound, mapOf("message" to "Section not found"))
        return false
    }
    if (!isAllowedByPolicy(claims, target.first, target.second)) {
        respond(HttpStatusCode.Forbidden, mapOf("message" to "You are not allowed to edit this schedule section."))
        return false
    }
    return true
}

suspend fun ApplicationCall.requireSchedulerWriteAccessByRowId(claims: JwtClaims, rowId: UUID): Boolean {
    val target = lookupTargetByRowId(rowId)
    if (target == null) {
        respond(HttpStatusCode.NotFound, mapOf("message" to "Schedule row not found"))
        return false
    }
    if (!isAllowedByPolicy(claims, target.first, target.second)) {
        respond(HttpStatusCode.Forbidden, mapOf("message" to "You are not allowed to edit this schedule row."))
        return false
    }
    return true
}


suspend fun ApplicationCall.requireSchedulerWriteAccessForCourse(claims: JwtClaims, courseCode: String, curriculumDept: String): Boolean {
    if (!isAllowedByPolicy(claims, courseCode, curriculumDept.uppercase())) {
        respond(HttpStatusCode.Forbidden, mapOf("message" to "You are not allowed to edit schedules for this course."))
        return false
    }
    return true
}


suspend fun ApplicationCall.requireSchedulerWriteAccessForCurriculumId(claims: JwtClaims, curriculumId: UUID): Boolean {
    val target = transaction {
        Curriculums.select { Curriculums.id eq curriculumId }.limit(1).singleOrNull()?.let {
            (it[Curriculums.courseCode]) to (it[Curriculums.dept].uppercase())
        }
    }
    if (target == null) {
        respond(HttpStatusCode.NotFound, mapOf("message" to "Curriculum not found"))
        return false
    }
    if (!isAllowedByPolicy(claims, target.first, target.second)) {
        respond(HttpStatusCode.Forbidden, mapOf("message" to "You are not allowed to edit schedules for this curriculum."))
        return false
    }
    return true
}
