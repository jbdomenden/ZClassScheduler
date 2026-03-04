package zeroday.Models.dto.schedule

import kotlinx.serialization.Serializable

/**
 * Shared schedule row requests used by STI/NAMEI/SHS/JHS schedulers.
 * Keep these here to avoid redeclaration across multiple DTO files.
 */
@Serializable
data class DuplicateScheduleRowRequest(
    val baseRowId: String
)

@Serializable
data class UpdateScheduleRowRequest(
    val day: String?,
    val startTime: String?,
    val endTime: String?,
    val roomId: String?,
    val teacherId: String?
)
