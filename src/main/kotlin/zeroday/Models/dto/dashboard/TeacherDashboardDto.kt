package zeroday.Models.dto.dashboard

import kotlinx.serialization.Serializable

@Serializable
data class TeacherTodayDto(
    val teacherName: String,
    val timeWindow: String
)

@Serializable
data class TeacherNowDto(
    val teacherName: String,
    val subject: String,
    val section: String,
    val room: String,
    val timeWindow: String
)
