package zeroday.Controller.service

import zeroday.Models.dto.dashboard.DashboardSummaryResponse
import zeroday.Models.dto.dashboard.DashboardIncompleteScheduleItem
import zeroday.Models.dto.dashboard.DashboardRoomScheduleItem
import zeroday.Queries.Dashboard.DashboardRepository
import java.time.LocalDate
import java.time.LocalTime

object DashboardService {

    fun summary(): DashboardSummaryResponse {
        val now = LocalTime.now()
        val day = LocalDate.now().dayOfWeek.name

        return DashboardSummaryResponse(
            activeSchedules = DashboardRepository.activeSchedules(now, day),
            activeRooms = DashboardRepository.activeRooms(now, day),
            activeTeachers = DashboardRepository.activeTeachers(now, day),
            totalSchedulesToday = DashboardRepository.schedulesToday(day),
            mostCommonConflict = DashboardRepository.mostCommonConflict()
        )
    }

    fun roomOverview(day: String): List<DashboardRoomScheduleItem> =
        DashboardRepository.roomOverview(day)

    fun incomplete(limit: Int = 200): List<DashboardIncompleteScheduleItem> =
        DashboardRepository.incomplete(limit)
}
