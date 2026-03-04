package zeroday.Models.db.tables

import org.jetbrains.exposed.dao.id.LongIdTable

object UsersTable : LongIdTable("users") {

    val email = varchar("email", 255).uniqueIndex()

    val passwordHash = varchar("password_hash", 255)

    val passwordSalt = varchar("password_salt", 255)

    val role = varchar("role", 50)
}
