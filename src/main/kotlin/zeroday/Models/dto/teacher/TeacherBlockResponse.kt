package zeroday.Models.dto.teacher

import kotlinx.serialization.Serializable

@Serializable
data class TeacherBlockResponse(
    val id: String,
    val teacherId: String,
    val type: String, // ADMIN | BREAK
    val dayOfWeek: String,
    val timeStart: String, // HH:mm:ss (from LocalTime.toString)
    val timeEnd: String,   // HH:mm:ss
)

