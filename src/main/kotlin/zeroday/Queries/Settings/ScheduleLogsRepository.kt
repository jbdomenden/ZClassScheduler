package zeroday.Queries.Settings

import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.ScheduleLogs
import zeroday.Models.dto.logs.ScheduleLogItem
import zeroday.Models.dto.logs.ScheduleLogListResponse
import java.time.Instant
import java.util.UUID

object ScheduleLogsRepository {
    fun log(
        actorUserKey: String,
        actorRole: String,
        actorEmail: String? = null,
        action: String,
        entityType: String,
        entityId: String? = null,
        scheduleBlock: String? = null,
        roomCode: String? = null,
        sectionCode: String? = null,
        teacherName: String? = null,
        previousValue: String? = null,
        newValue: String? = null,
        notes: String? = null,
    ) = transaction {
        ScheduleLogs.insert {
            it[id] = UUID.randomUUID()
            it[ScheduleLogs.actorUserKey] = actorUserKey
            it[ScheduleLogs.actorRole] = actorRole
            it[ScheduleLogs.actorEmail] = actorEmail?.trim()?.ifBlank { null }
            it[ScheduleLogs.action] = action
            it[ScheduleLogs.entityType] = entityType
            it[ScheduleLogs.entityId] = entityId
            it[ScheduleLogs.scheduleBlock] = scheduleBlock
            it[ScheduleLogs.roomCode] = roomCode
            it[ScheduleLogs.sectionCode] = sectionCode
            it[ScheduleLogs.teacherName] = teacherName
            it[ScheduleLogs.previousValue] = previousValue
            it[ScheduleLogs.newValue] = newValue
            it[ScheduleLogs.notes] = notes
            it[timestamp] = Instant.now()
        }
    }

    fun list(limit: Int, offset: Long, search: String? = null, action: String? = null): ScheduleLogListResponse = transaction {
        val safeLimit = limit.coerceIn(1, 500)
        val safeOffset = offset.coerceAtLeast(0)
        val q = ScheduleLogs.selectAll()

        action?.trim()?.takeIf { it.isNotEmpty() }?.let { a -> q.andWhere { ScheduleLogs.action eq a.uppercase() } }
        search?.trim()?.takeIf { it.isNotEmpty() }?.let { term ->
            val like = "%$term%"
            q.andWhere {
                (ScheduleLogs.action like like) or
                        (ScheduleLogs.actorRole like like) or
                        (ScheduleLogs.actorEmail like like) or
                        (ScheduleLogs.entityType like like) or
                        (ScheduleLogs.entityId like like) or
                        (ScheduleLogs.scheduleBlock like like) or
                        (ScheduleLogs.roomCode like like) or
                        (ScheduleLogs.sectionCode like like) or
                        (ScheduleLogs.teacherName like like) or
                        (ScheduleLogs.previousValue like like) or
                        (ScheduleLogs.newValue like like) or
                        (ScheduleLogs.notes like like)
            }
        }

        val rows = q.orderBy(ScheduleLogs.timestamp to SortOrder.DESC)
            .limit(safeLimit + 1, offset = safeOffset)
            .toList()

        val hasMore = rows.size > safeLimit
        val items = (if (hasMore) rows.dropLast(1) else rows).map {
            ScheduleLogItem(
                id = it[ScheduleLogs.id].toString(),
                actorUserKey = it[ScheduleLogs.actorUserKey],
                actorRole = it[ScheduleLogs.actorRole],
                actorEmail = it[ScheduleLogs.actorEmail],
                action = it[ScheduleLogs.action],
                entityType = it[ScheduleLogs.entityType],
                entityId = it[ScheduleLogs.entityId],
                scheduleBlock = it[ScheduleLogs.scheduleBlock],
                roomCode = it[ScheduleLogs.roomCode],
                sectionCode = it[ScheduleLogs.sectionCode],
                teacherName = it[ScheduleLogs.teacherName],
                previousValue = it[ScheduleLogs.previousValue],
                newValue = it[ScheduleLogs.newValue],
                notes = it[ScheduleLogs.notes],
                timestamp = it[ScheduleLogs.timestamp].toString(),
            )
        }

        ScheduleLogListResponse(
            items = items,
            limit = safeLimit,
            offset = safeOffset,
            nextOffset = if (hasMore) (safeOffset + safeLimit) else null,
        )
    }
}
