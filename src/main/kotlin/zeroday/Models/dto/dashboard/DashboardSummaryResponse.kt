package zeroday.Models.dto.dashboard

import kotlinx.serialization.Serializable

@Serializable
data class DashboardSummaryResponse(
    val activeSchedules: Int,
    val activeRooms: Int,
    val activeTeachers: Int,
    val totalSchedulesToday: Int,
    val mostCommonConflict: String?
)
