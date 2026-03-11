package zeroday.Models.db.bootstrap

import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import org.slf4j.LoggerFactory
import zeroday.Controller.security.PasswordCrypto
import zeroday.Models.db.models.UserEntity
import zeroday.Models.db.tables.Teachers
import zeroday.Queries.Login.UserRepository
import java.util.UUID

object SuperAdminBootstrap {

    private val log = LoggerFactory.getLogger("SuperAdminBootstrap")

    fun init(userRepository: UserRepository) {

        val email = "admin@zcs.edu"
        val superAdminRole = "SUPER_ADMIN"
        val allDepartments = "ICT,THM,BM,GE,ME,MT,NA,HS,STAFF"

        // 1) Ensure login user exists and has SUPER_ADMIN role
        val existing = userRepository.findByEmail(email)
        if (existing != null) {
            if (!existing.role.equals(superAdminRole, ignoreCase = true)) {
                userRepository.updateRoleByEmail(email, superAdminRole)
                log.info("🔁 Updated bootstrap account role to $superAdminRole: $email")
            }
            ensureTeacherProfile(email, superAdminRole, allDepartments)
            log.info("✅ Super admin already exists and is normalized: $email")
            return
        }

        // 2) Create login user
        val salt = PasswordCrypto.generateSalt()
        val hash = PasswordCrypto.hash("admin123", salt)

        val admin = UserEntity(
            id = 0L,
            email = email,
            passwordHash = hash,
            passwordSalt = salt,
            role = superAdminRole
        )

        userRepository.insert(admin)

        // 3) Ensure teacher table also has SUPER_ADMIN identity
        ensureTeacherProfile(email, superAdminRole, allDepartments)

        log.info("🚀 Super admin created and normalized: $email / admin123")
    }

    private fun ensureTeacherProfile(email: String, role: String, allDepartments: String) {
        transaction {
            val existingTeacher = Teachers
                .select { Teachers.email eq email }
                .limit(1)
                .singleOrNull()

            if (existingTeacher == null) {
                Teachers.insert {
                    it[id] = UUID.randomUUID()
                    it[empId] = null
                    it[firstName] = "Super"
                    it[lastName] = "Admin"
                    it[name] = "Super Admin"
                    it[department] = allDepartments
                    it[Teachers.email] = email
                    it[password] = "admin123"
                    it[Teachers.role] = role
                    it[active] = true
                }
            } else {
                Teachers.update({ Teachers.email eq email }) {
                    it[department] = allDepartments
                    it[Teachers.role] = role
                    it[active] = true
                }
            }
        }
    }
}
