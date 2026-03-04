package zeroday.Models.dto.schedule


import kotlinx.serialization.Serializable


@Serializable
data class ScheduleRequest(
    val courseCode: String,
    val section: String,
    val curriculumId: String?,
    val subjectId: String,
    val teacherId: String,
    val roomId: String,
    val dayOfWeek: String,
    val timeStart: String, // HH:mm
    val timeEnd: String, // HH:mm
    val sectionName: String,
    val subjectName: String
)

@Serializable
data class ConflictResponse(
    val reason: String
)