package zeroday.Queries.Login

import zeroday.Models.db.tables.*
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.*


object AuditLogRepository {


    fun log(
        userKey: String,
        role: String,
        action: String,
        entity: String,
        entityId: UUID? = null,
        success: Boolean,
        message: String? = null,
        userEmail: String? = null,
        httpMethod: String? = null,
        path: String? = null,
    ) {
        val syntheticUserId = UUID.nameUUIDFromBytes(("USER:$userKey").toByteArray(Charsets.UTF_8))
        transaction {
            AuditLogs.insert {
                it[id] = UUID.randomUUID()
                it[AuditLogs.userId] = syntheticUserId
                it[AuditLogs.userKey] = userKey
                it[AuditLogs.userEmail] = userEmail
                it[AuditLogs.role] = role
                it[AuditLogs.action] = action
                it[AuditLogs.entity] = entity
                it[AuditLogs.entityId] = entityId
                it[AuditLogs.success] = success
                it[AuditLogs.message] = message
                it[AuditLogs.httpMethod] = httpMethod
                it[AuditLogs.path] = path
                it[timestamp] = System.currentTimeMillis()
            }
        }
    }
}
