package zeroday.Queries.Settings

import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.AuditLogs
import zeroday.Models.db.tables.Teachers
import zeroday.Models.dto.audit.AuditLogItem
import zeroday.Models.dto.audit.AuditLogListResponse

object AuditLogsQueryRepository {

    fun list(
        limit: Int,
        offset: Long,
        role: String? = null,
        entity: String? = null,
        action: String? = null,
        success: Boolean? = null,
        q: String? = null,
        privilegedOnly: Boolean = true,
    ): AuditLogListResponse = transaction {

        val safeLimit = limit.coerceIn(1, 500)
        val safeOffset = offset.coerceAtLeast(0)

        val query = AuditLogs.selectAll()

        if (privilegedOnly) {
            query.andWhere { (AuditLogs.role eq "ADMIN") or (AuditLogs.role eq "SUPER_ADMIN") }
        }
        role?.trim()?.takeIf { it.isNotEmpty() }?.let { r ->
            query.andWhere { AuditLogs.role eq r.uppercase() }
        }
        entity?.trim()?.takeIf { it.isNotEmpty() }?.let { e ->
            query.andWhere { AuditLogs.entity eq e }
        }
        action?.trim()?.takeIf { it.isNotEmpty() }?.let { a ->
            query.andWhere { AuditLogs.action eq a }
        }
        success?.let { s ->
            query.andWhere { AuditLogs.success eq s }
        }
        q?.trim()?.takeIf { it.isNotEmpty() }?.let { term ->
            val like = "%$term%"
            query.andWhere {
                (AuditLogs.message like like) or
                        (AuditLogs.userEmail like like) or
                        (AuditLogs.userKey like like) or
                        (AuditLogs.action like like) or
                        (AuditLogs.entity like like)
            }
        }

        val rows = query
            .orderBy(AuditLogs.timestamp to SortOrder.DESC)
            .limit(safeLimit + 1, offset = safeOffset)
            .toList()

        val hasMore = rows.size > safeLimit
        val pageRows = if (hasMore) rows.dropLast(1) else rows

        val emails = pageRows
            .mapNotNull { it[AuditLogs.userEmail]?.trim()?.lowercase()?.takeIf { e -> e.isNotEmpty() } }
            .distinct()

        val nameByEmail = if (emails.isEmpty()) {
            emptyMap()
        } else {
            Teachers
                .slice(Teachers.email, Teachers.name, Teachers.firstName, Teachers.lastName)
                .select { Teachers.email inList emails }
                .associate { r ->
                    val email = r[Teachers.email].trim().lowercase()
                    val name = r[Teachers.name].trim().ifEmpty {
                        "${r[Teachers.firstName]} ${r[Teachers.lastName]}".replace("\\s+".toRegex(), " ").trim()
                    }
                    email to name
                }
        }

        val items = pageRows.map { r ->
            val email = r[AuditLogs.userEmail]?.trim()?.lowercase()
            AuditLogItem(
                id = r[AuditLogs.id].toString(),
                userKey = r[AuditLogs.userKey],
                userEmail = r[AuditLogs.userEmail],
                userName = email?.let { nameByEmail[it] },
                role = r[AuditLogs.role],
                action = r[AuditLogs.action],
                entity = r[AuditLogs.entity],
                entityId = r[AuditLogs.entityId]?.toString(),
                success = r[AuditLogs.success],
                message = r[AuditLogs.message],
                httpMethod = r[AuditLogs.httpMethod],
                path = r[AuditLogs.path],
                timestamp = r[AuditLogs.timestamp],
            )
        }

        AuditLogListResponse(
            items = items,
            limit = safeLimit,
            offset = safeOffset,
            nextOffset = if (hasMore) (safeOffset + safeLimit) else null,
        )
    }
}
