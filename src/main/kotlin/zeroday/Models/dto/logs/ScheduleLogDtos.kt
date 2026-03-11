package zeroday.Models.dto.logs

import kotlinx.serialization.Serializable

@Serializable
data class ScheduleLogItem(
    val id: String,
    val actorUserKey: String,
    val actorRole: String,
    val actorEmail: String? = null,
    val action: String,
    val entityType: String,
    val entityId: String? = null,
    val scheduleBlock: String? = null,
    val roomCode: String? = null,
    val sectionCode: String? = null,
    val teacherName: String? = null,
    val previousValue: String? = null,
    val newValue: String? = null,
    val notes: String? = null,
    val timestamp: String,
)

@Serializable
data class ScheduleLogListResponse(
    val items: List<ScheduleLogItem>,
    val limit: Int,
    val offset: Long,
    val nextOffset: Long? = null,
)
