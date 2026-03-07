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

        var snapped = when (mode) {
            SnapMode.FLOOR -> minutes - rem
            SnapMode.CEIL -> minutes + (30 - rem)
            SnapMode.NEAREST -> {
                val down = minutes - rem
                val up = minutes + (30 - rem)
                // Avoid snapping to 24:00 which is not representable as LocalTime.
                if (up >= 24 * 60) down
                else if ((minutes - down) <= (up - minutes)) down else up
            }
        }

        // If CEIL pushed beyond end-of-day, clamp to last valid half-hour slot.
        if (snapped >= 24 * 60) snapped = (24 * 60) - 30

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
        if (!isWithinBounds(start, end)) return TimeValidation(false, "Outside bounds 07:00-21:00 or end<=start")
        if (!isOnHalfHour(start) || !isOnHalfHour(end)) return TimeValidation(false, "Not aligned to 30-min grid")
        if (!isAllowedDuration(start, end)) return TimeValidation(false, "Duration must be 60/90/120/180 minutes")
        return TimeValidation(true, null)
    }

    /**
     * Normalizes (snap-to-grid) then strictly validates. Use this before writing schedule times to the DB.
     * Throws [IllegalArgumentException] with a human-readable reason when invalid.
     */
    fun normalizeStrict(start: LocalTime, end: LocalTime): Pair<LocalTime, LocalTime> {
        val snappedStart = snapToHalfHour(start, SnapMode.NEAREST)
        val snappedEnd = snapToHalfHour(end, SnapMode.NEAREST)

        val v = validateStrict(snappedStart, snappedEnd)
        if (!v.ok) throw IllegalArgumentException(v.reason ?: "Invalid schedule time")

        return snappedStart to snappedEnd
    }

    /**
     * For nullable schedule fields: both null is allowed (unscheduled). Partial values are rejected.
     */
    fun normalizeStrictOrNull(start: LocalTime?, end: LocalTime?): Pair<LocalTime?, LocalTime?> {
        if (start == null && end == null) return null to null
        if (start == null || end == null) {
            throw IllegalArgumentException("Both start and end times must be provided (or both null).")
        }
        val (s, e) = normalizeStrict(start, end)
        return s to e
    }

    /**
     * Read-time safety for legacy/dirty rows. Returns normalized times if valid; otherwise resets to nulls.
     * This prevents invalid stored times (e.g. 10:56) from breaking grid rendering.
     */
    fun normalizeForReadOrReset(start: LocalTime?, end: LocalTime?): Pair<LocalTime?, LocalTime?> {
        if (start == null || end == null) return null to null

        val snappedStart = snapToHalfHour(start, SnapMode.NEAREST)
        val snappedEnd = snapToHalfHour(end, SnapMode.NEAREST)

        val v = validateStrict(snappedStart, snappedEnd)
        return if (v.ok) snappedStart to snappedEnd else null to null
    }

    enum class SnapMode { FLOOR, CEIL, NEAREST }

    data class TimeValidation(val ok: Boolean, val reason: String?)
}

