package zeroday.Controller.service

import zeroday.Models.dto.ConflictPromptDto
import zeroday.Models.db.tables.AuditLogs
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

object DashboardConflictService {

    fun latestConflicts(limit: Int = 10): List<ConflictPromptDto> = transaction {

        AuditLogs
            .select { AuditLogs.success eq false }
            .orderBy(AuditLogs.timestamp to SortOrder.DESC)
            .limit(limit)
            .map { row ->

                val type = runCatching {
                    ConflictType.valueOf(row[AuditLogs.message] ?: "")
                }.getOrElse {
                    ConflictType.UNKNOWN
                }




                ConflictPromptDto(
                    priority = ConflictPriorityService.resolve(type).name,
                    message = ConflictPriorityService.label(type),
                    timestamp = row[AuditLogs.timestamp].toString()
                )
            }
    }
}
