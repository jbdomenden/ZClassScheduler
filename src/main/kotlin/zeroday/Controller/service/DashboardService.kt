package zeroday.Controller.service

import zeroday.Models.dto.dashboard.DashboardSummaryResponse
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
}
