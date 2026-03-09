package zeroday.Models.dto.dashboard

import kotlinx.serialization.Serializable

@Serializable
data class RoomUtilizationWeekGridRoom(
    val roomName: String,
    val byDay: Map<String, Int>,
    val total: Int,
)

@Serializable
data class RoomUtilizationWeekGridResponse(
    val days: List<String>,
    val overallByDay: Map<String, Int>,
    val overallTotal: Int,
    val rooms: List<RoomUtilizationWeekGridRoom>,
)

