package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table
import java.time.Instant
import java.util.*


object AuditLogs : Table("audit_logs") {
    val id = uuid("id")
    val userId = uuid("user_id")
    val role = varchar("role", 30)
    val action = varchar("action", 50) // CREATE_SCHEDULE, UPDATE_ROOM, etc
    val entity = varchar("entity", 50) // Schedule, Room, Teacher
    val entityId = uuid("entity_id").nullable()
    val success = bool("success")
    val message = varchar("message", 255).nullable()
    val timestamp = long("timestamp") // epoch millis


    override val primaryKey = PrimaryKey(id)
}