package zeroday.Models.dto.checker

import kotlinx.serialization.Serializable

@Serializable
data class CheckerReportRequest(
    val scheduleId: String,
    // New: 3-state status. Keep `present` optional for backward compatibility with older clients.
    val status: String? = null, // PRESENT | ABSENT | NOT_IN_CLASS
    val present: Boolean? = null,
    val note: String? = null,
)

@Serializable
data class CheckerLogItem(
    val id: String,
    val timestamp: String,
    val checkerUserKey: String,
    val checkerEmail: String? = null,
    val checkerName: String? = null,
    val scheduleId: String? = null,
    val teacherId: String? = null,
    val teacherName: String,
    val teacherDepartment: String,
    val roomId: String? = null,
    val roomCode: String,
    val courseCode: String,
    val sectionName: String,
    val subjectName: String,
    val dayOfWeek: String,
    val timeStart: String,
    val timeEnd: String,
    val status: String, // PRESENT | ABSENT | NOT_IN_CLASS
    val present: Boolean,
    val note: String? = null,
)

@Serializable
data class CheckerLogListResponse(
    val items: List<CheckerLogItem>,
    val limit: Int,
    val offset: Long,
    val nextOffset: Long? = null,
)
