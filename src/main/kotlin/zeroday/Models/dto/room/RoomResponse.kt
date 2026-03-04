package zeroday.Models.dto.room

import kotlinx.serialization.Serializable

@Serializable
data class RoomResponse(
    val id: String,
    val code: String,
    val floor: String,
    val capacity: Int,
    val type: String,
    val status: String
)
