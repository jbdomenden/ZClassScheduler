package zeroday.Queries.Settings

import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import zeroday.Controller.security.PasswordCrypto
import zeroday.Models.db.tables.Teachers
import zeroday.Models.db.tables.UsersTable
import java.util.UUID

object TeacherRepository {

    private fun blankToNull(s: String?): String? =
        s?.trim()?.takeIf { it.isNotEmpty() }

    private fun normalizeRoleForStorage(roleRaw: String?): String {
        val r0 = (roleRaw ?: "").trim()
        if (r0.isEmpty()) return "TEACHER"

        val r = r0
            .trim()
            .uppercase()
            .replace("\\s+".toRegex(), "_")
            .replace("-", "_")

        return when (r) {
            "SUPERADMIN" -> "SUPER_ADMIN"
            "SUPER_ADMIN" -> "SUPER_ADMIN"
            "ADMIN" -> "ADMIN"
            "CHECKER" -> "CHECKER"
            "NONTEACHING" -> "NON_TEACHING"
            "NON_TEACHING" -> "NON_TEACHING"
            "TEACHER" -> "TEACHER"
            "INSTRUCTOR" -> "TEACHER"
            else -> r
        }
    }

    private fun parseDepartments(raw: String?): Set<String> =
        (raw ?: "")
            .split(",", ";", "|")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .map { it.uppercase() }
            .toSet()

    private fun normalizeEmail(email: String): String =
        email.trim().lowercase().replace("\\s+".toRegex(), "")

    private fun buildName(first: String, last: String): String =
        "${first.trim()} ${last.trim()}".trim()

    fun listAll(): List<Map<String, Any?>> = transaction {
        Teachers.selectAll().map {
            mapOf(
                "id" to it[Teachers.id].toString(),
                "empId" to (it[Teachers.empId] ?: ""),
                "firstName" to it[Teachers.firstName],
                "lastName" to it[Teachers.lastName],
                "name" to it[Teachers.name],
                "department" to it[Teachers.department],
                "email" to it[Teachers.email],
                "role" to normalizeRoleForStorage(it[Teachers.role]),
                "status" to if (it[Teachers.active]) "Active" else "Inactive"
            )
        }
    }

    fun createWithLogin(
        empId: String,
        firstName: String,
        lastName: String,
        department: String,
        email: String,
        passwordPlain: String,
        role: String,
        active: Boolean = true
    ): UUID = transaction {

        val normalizedEmail = normalizeEmail(email)

        // prevent duplicate login email
        if (UsersTable.select { UsersTable.email eq normalizedEmail }.any()) {
            error("Email already exists for login.")
        }

        val teacherId = UUID.randomUUID()
        val roleNorm = normalizeRoleForStorage(role)

        // 1) insert teacher
        Teachers.insert {
            it[id] = teacherId
            it[Teachers.empId] = blankToNull(empId)
            it[Teachers.firstName] = firstName.trim()
            it[Teachers.lastName] = lastName.trim()
            it[Teachers.name] = buildName(firstName, lastName)
            it[Teachers.department] = department.trim()
            it[Teachers.email] = normalizedEmail
            it[Teachers.password] = passwordPlain
            it[Teachers.role] = roleNorm
            it[Teachers.active] = active
        }

        // 2) create login user
        val salt = PasswordCrypto.generateSalt()
        val hash = PasswordCrypto.hash(passwordPlain, salt)

        UsersTable.insert {
            it[UsersTable.email] = normalizedEmail
            it[UsersTable.passwordSalt] = salt
            it[UsersTable.passwordHash] = hash
            it[UsersTable.role] = roleNorm
        }

        teacherId
    }

    fun updateWithLogin(
        id: UUID,
        empId: String,
        firstName: String,
        lastName: String,
        department: String,
        emailInput: String,
        passwordPlain: String, // may be ""
        role: String,
        active: Boolean
    ) = transaction {

        val normalizedEmail = normalizeEmail(emailInput)
        val updatePassword = passwordPlain.trim().isNotEmpty()
        val roleNorm = normalizeRoleForStorage(role)

        // teacher current row
        val current = Teachers.select { Teachers.id eq id }.single()
        val oldEmail = current[Teachers.email]

        // if changing email, ensure new email not taken in users
        if (oldEmail != normalizedEmail) {
            if (UsersTable.select { UsersTable.email eq normalizedEmail }.any()) {
                error("Email already exists for login.")
            }
        }

        // 1) update teacher row
        Teachers.update({ Teachers.id eq id }) {
            it[Teachers.empId] = blankToNull(empId)
            it[Teachers.firstName] = firstName.trim()
            it[Teachers.lastName] = lastName.trim()
            it[Teachers.name] = buildName(firstName, lastName)
            it[Teachers.department] = department.trim()
            it[Teachers.email] = normalizedEmail
            if (updatePassword) it[Teachers.password] = passwordPlain
            it[Teachers.role] = roleNorm
            it[Teachers.active] = active
        }

        // 2) update login user row (match by oldEmail)
        val existingUser = UsersTable.select { UsersTable.email eq oldEmail }.singleOrNull()

        if (existingUser != null) {
            UsersTable.update({ UsersTable.email eq oldEmail }) {
                it[UsersTable.email] = normalizedEmail
                it[UsersTable.role] = roleNorm

                if (updatePassword) {
                    val salt = PasswordCrypto.generateSalt()
                    val hash = PasswordCrypto.hash(passwordPlain, salt)
                    it[passwordSalt] = salt
                    it[passwordHash] = hash
                }
            }
        } else {
            // if missing user row, recreate it (only if we have a password to set)
            if (updatePassword) {
                val salt = PasswordCrypto.generateSalt()
                val hash = PasswordCrypto.hash(passwordPlain, salt)

                UsersTable.insert {
                    it[UsersTable.email] = normalizedEmail
                    it[passwordSalt] = salt
                    it[passwordHash] = hash
                    it[UsersTable.role] = roleNorm
                }
            }
        }
    }

    fun deactivate(id: UUID) = transaction {
        Teachers.update({ Teachers.id eq id }) { it[active] = false }
    }

    fun existsEmpId(empId: String, excludeId: UUID? = null): Boolean = transaction {
        val normalized = blankToNull(empId) ?: return@transaction false
        val q = Teachers.select { Teachers.empId eq normalized }
        val filtered = if (excludeId == null) q else q.andWhere { Teachers.id neq excludeId }
        filtered.any()
    }

    fun existsEmail(email: String, excludeId: UUID? = null): Boolean = transaction {
        val normalized = normalizeEmail(email)
        val q = Teachers.select { Teachers.email eq normalized }
        val filtered = if (excludeId == null) q else q.andWhere { Teachers.id neq excludeId }
        filtered.any()
    }

    fun findDepartmentByEmail(email: String): String? = transaction {
        val normalized = normalizeEmail(email)
        Teachers
            .slice(Teachers.department)
            .select { Teachers.email eq normalized }
            .limit(1)
            .singleOrNull()
            ?.get(Teachers.department)
    }

    fun findDepartmentById(id: UUID): String? = transaction {
        Teachers
            .slice(Teachers.department)
            .select { Teachers.id eq id }
            .limit(1)
            .singleOrNull()
            ?.get(Teachers.department)
    }

    fun findDepartmentsByEmail(email: String): Set<String> =
        parseDepartments(findDepartmentByEmail(email))

    fun findDepartmentsById(id: UUID): Set<String> =
        parseDepartments(findDepartmentById(id))

    fun findRoleById(id: UUID): String? = transaction {
        Teachers
            .slice(Teachers.role)
            .select { Teachers.id eq id }
            .limit(1)
            .singleOrNull()
            ?.get(Teachers.role)
            ?.let { normalizeRoleForStorage(it) }
    }

    fun isInstructorAssignable(teacherId: UUID): Boolean {
        val role = findRoleById(teacherId) ?: "TEACHER"
        return role != "CHECKER" && role != "NON_TEACHING"
    }
}
