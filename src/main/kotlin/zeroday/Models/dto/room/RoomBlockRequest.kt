package zeroday.Models.dto.room


import kotlinx.serialization.Serializable
import zeroday.Models.db.tables.RoomBlockType


@Serializable
data class RoomBlockRequest(
    val roomId: String,
    val dayOfWeek: Int,
    val timeStart: String,
    val timeEnd: String,
    val type: RoomBlockType
)