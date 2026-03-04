package zeroday.Models.dto.schedule

data class LiveScheduleResponse(
    val now: List<ScheduleLiveItem>,
    val next: List<ScheduleLiveItem>,
    val upcoming: List<ScheduleLiveItem>
)

data class ScheduleLiveItem(
    val scheduleId: String,
    val courseCode: String,
    val section: String,
    val roomName: String,
    val teacherName: String,
    val timeStart: String,
    val timeEnd: String
)
