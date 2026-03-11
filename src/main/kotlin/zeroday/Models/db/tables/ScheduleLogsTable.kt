package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.timestamp
import java.util.UUID

object ScheduleLogs : Table("schedule_logs") {
    val id = uuid("id")
    val actorUserKey = varchar("actor_user_key", 120)
    val actorRole = varchar("actor_role", 50)
    val actorEmail = varchar("actor_email", 255).nullable()

    val action = varchar("action", 80)
    val entityType = varchar("entity_type", 80)
    val entityId = varchar("entity_id", 120).nullable()

    val scheduleBlock = varchar("schedule_block", 80).nullable()
    val roomCode = varchar("room_code", 50).nullable()
    val sectionCode = varchar("section_code", 80).nullable()
    val teacherName = varchar("teacher_name", 120).nullable()

    val previousValue = text("previous_value").nullable()
    val newValue = text("new_value").nullable()
    val notes = text("notes").nullable()

    val timestamp = timestamp("timestamp")

    override val primaryKey = PrimaryKey(id)
}
