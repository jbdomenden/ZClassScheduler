package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table

object Teachers : Table("teachers") {

    val id = uuid("id")
    val empId = varchar("emp_id", 50).nullable().uniqueIndex()

    val firstName = varchar("first_name", 50)
    val lastName = varchar("last_name", 50)

    // ✅ NEW
    val name = varchar("name", 120).default("")

    val department = varchar("department", 50)
    val email = varchar("email", 255).uniqueIndex()

    // Store hash or plain? We'll store the same password string UI sends (but we keep login in UsersTable).
    val password = varchar("password", 255)

    val role = varchar("role", 255).nullable()
    val active = bool("active").default(true)

    override val primaryKey = PrimaryKey(id)
}
