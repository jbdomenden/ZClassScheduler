package zeroday.Models.dto.dashboard

import kotlinx.serialization.Serializable

@Serializable
data class DashboardRoomScheduleItem(
    val roomCode: String,
    val startTime: String,
    val endTime: String,
    val subject: String,
    val section: String,
    val teacher: String
)

@Serializable
data class DashboardIncompleteScheduleItem(
    val subject: String,
    val section: String,
    val day: String? = null,
    val time: String? = null,
    val teacher: String? = null,
    val room: String? = null
)

