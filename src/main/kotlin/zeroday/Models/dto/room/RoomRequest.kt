package zeroday.Models.dto.room

import zeroday.Models.db.tables.RoomType
import kotlinx.serialization.Serializable

@Serializable
data class RoomRequest(
    val code: String,
    val floor: String,
    val capacity: Int,
    val type: RoomType,
    val status: String? = null
)
