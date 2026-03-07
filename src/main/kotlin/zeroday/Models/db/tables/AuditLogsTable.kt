package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table
import java.time.Instant
import java.util.*


object AuditLogs : Table("audit_logs") {
    val id = uuid("id")
    // NOTE: Auth users are stored in UsersTable with a Long id, but this column is UUID.
    // We store a stable synthetic UUID derived from the JWT userId claim (see AuditLogRepository).
    val userId = uuid("user_id")

    // Raw user id from JWT (UsersTable.id as string). Helps debugging without having to reverse UUID mapping.
    val userKey = varchar("user_key", 80).nullable()

    // Email from JWT (if present). Useful for SUPER_ADMIN audit log viewer.
    val userEmail = varchar("user_email", 255).nullable()

    val role = varchar("role", 30)
    val action = varchar("action", 50) // CREATE_SCHEDULE, UPDATE_ROOM, etc
    val entity = varchar("entity", 50) // Schedule, Room, Teacher
    val entityId = uuid("entity_id").nullable()
    val success = bool("success")
    val message = varchar("message", 255).nullable()

    // Request context (optional)
    val httpMethod = varchar("http_method", 10).nullable()
    val path = varchar("path", 200).nullable()

    val timestamp = long("timestamp") // epoch millis


    override val primaryKey = PrimaryKey(id)
}
