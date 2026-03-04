package zeroday.Models.dto.dashboard

import kotlinx.serialization.Serializable

@Serializable
data class RoomUtilizationDto(
    val roomName: String,
    val utilizationPercent: Int
)
