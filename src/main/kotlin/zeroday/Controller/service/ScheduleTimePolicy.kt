package zeroday.Controller.service

import java.time.LocalTime

object ScheduleTimePolicy {
    val EARLIEST_START: LocalTime = LocalTime.of(7, 0)
    val LATEST_END: LocalTime = LocalTime.of(21, 0)

    // minutes
    private val allowedDurations = setOf(60, 90, 120, 180)

    fun isOnHalfHour(t: LocalTime): Boolean = (t.minute == 0 || t.minute == 30)

    fun snapToHalfHour(t: LocalTime, mode: SnapMode): LocalTime {
        val minutes = t.hour * 60 + t.minute
        val rem = minutes % 30
        if (rem == 0) return t

        val snapped = when (mode) {
            SnapMode.FLOOR -> minutes - rem
            SnapMode.CEIL -> minutes + (30 - rem)
            SnapMode.NEAREST -> {
                val down = minutes - rem
                val up = minutes + (30 - rem)
                if ((minutes - down) <= (up - minutes)) down else up
            }
        }

        val hh = snapped / 60
        val mm = snapped % 60
        return LocalTime.of(hh, mm)
    }

    fun isAllowedDuration(start: LocalTime, end: LocalTime): Boolean {
        val dur = java.time.Duration.between(start, end).toMinutes().toInt()
        return dur in allowedDurations
    }

    fun isWithinBounds(start: LocalTime, end: LocalTime): Boolean {
        return !start.isBefore(EARLIEST_START) && !end.isAfter(LATEST_END) && end.isAfter(start)
    }

    fun validateStrict(start: LocalTime, end: LocalTime): TimeValidation {
        if (!isWithinBounds(start, end)) return TimeValidation(false, "Outside bounds 07:00–21:00 or end<=start")
        if (!isOnHalfHour(start) || !isOnHalfHour(end)) return TimeValidation(false, "Not aligned to 30-min grid")
        if (!isAllowedDuration(start, end)) return TimeValidation(false, "Duration must be 60/90/120/180 minutes")
        return TimeValidation(true, null)
    }

    enum class SnapMode { FLOOR, CEIL, NEAREST }

    data class TimeValidation(val ok: Boolean, val reason: String?)
}

