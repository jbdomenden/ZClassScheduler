package zeroday.Models.dto.dashboard

data class DashboardSummaryResponse(
    val activeSchedules: Int,
    val activeRooms: Int,
    val activeTeachers: Int,
    val totalSchedulesToday: Int,
    val mostCommonConflict: String?
)
