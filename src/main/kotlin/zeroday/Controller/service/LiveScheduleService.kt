package zeroday.Controller.service

import zeroday.Models.dto.schedule.LiveScheduleResponse
import zeroday.Queries.Dashboard.LiveScheduleRepository
import java.time.LocalDate
import java.time.LocalTime

object LiveScheduleService {

    fun fetch(): LiveScheduleResponse {
        val now = LocalTime.now()
        val day = LocalDate.now().dayOfWeek.name

        return LiveScheduleResponse(
            now = LiveScheduleRepository.now(day, now),
            next = LiveScheduleRepository.next(day, now),
            upcoming = LiveScheduleRepository.upcoming(day, now)
        )
    }
}
