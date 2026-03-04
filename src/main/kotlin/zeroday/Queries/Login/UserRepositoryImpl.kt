package zeroday.Queries.Login

import zeroday.Models.db.models.UserEntity
import zeroday.Models.db.tables.UsersTable
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction

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
}
