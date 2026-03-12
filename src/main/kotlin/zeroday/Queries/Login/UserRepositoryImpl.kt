package zeroday.Queries.Login

import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.transactions.transaction
import org.jetbrains.exposed.sql.update
import zeroday.Models.db.models.UserEntity
import zeroday.Models.db.tables.UsersTable

class UserRepositoryImpl : UserRepository {

    override fun findByEmail(email: String): UserEntity? =
        transaction {
            UsersTable
                .select { UsersTable.email eq email }
                .map { row ->
                    UserEntity(
                        id = row[UsersTable.id].value,
                        email = row[UsersTable.email],
                        passwordHash = row[UsersTable.passwordHash],
                        passwordSalt = row[UsersTable.passwordSalt],
                        role = row[UsersTable.role]
                    )
                }
                .singleOrNull()
        }

    override fun insert(user: UserEntity) {
        transaction {
            UsersTable.insert {
                it[email] = user.email
                it[passwordHash] = user.passwordHash
                it[passwordSalt] = user.passwordSalt
                it[role] = user.role
            }
        }
    }

    override fun updateRoleByEmail(email: String, role: String): Boolean =
        transaction {
            UsersTable.update({ UsersTable.email eq email.trim().lowercase() }) {
                it[UsersTable.role] = role.trim().uppercase()
            } > 0
        }

    fun updatePasswordByEmail(email: String, newSalt: String, newHash: String): Boolean =
        transaction {
            UsersTable.update({ UsersTable.email eq email.trim().lowercase() }) {
                it[passwordSalt] = newSalt
                it[passwordHash] = newHash
            } > 0
        }
}
