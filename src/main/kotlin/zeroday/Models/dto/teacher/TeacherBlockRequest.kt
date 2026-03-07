package zeroday.Models.dto.teacher


import kotlinx.serialization.Serializable


@Serializable
data class TeacherBlockRequest(
    val teacherId: String,
    val type: String, // ADMIN | BREAK | REST_DAY
    val dayOfWeek: String,
    val timeStart: String,
    val timeEnd: String
)
