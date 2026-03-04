package zeroday.Queries.Login

import zeroday.Models.db.tables.*
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.*


object AuditLogRepository {


    fun log(
        userId: UUID,
        role: String,
        action: String,
        entity: String,
        entityId: UUID? = null,
        success: Boolean,
        message: String? = null
    ) {
        transaction {
            AuditLogs.insert {
                it[id] = UUID.randomUUID()
                it[AuditLogs.userId] = userId
                it[AuditLogs.role] = role
                it[AuditLogs.action] = action
                it[AuditLogs.entity] = entity
                it[AuditLogs.entityId] = entityId
                it[AuditLogs.success] = success
                it[AuditLogs.message] = message
                it[timestamp] = System.currentTimeMillis()
            }
        }
    }
}