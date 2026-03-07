package zeroday.Controller.service

import zeroday.Models.db.tables.*
import zeroday.Models.dto.dashboard.RoomUtilizationDto
import zeroday.Models.dto.dashboard.RoomUtilizationWeekGridResponse
import zeroday.Models.dto.dashboard.RoomUtilizationWeekGridRoom
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalTime

object RoomUtilizationService {

    private fun toMin(t: LocalTime): Int = t.hour * 60 + t.minute

    private fun sumMergedMinutes(rawIntervals: List<Pair<Int, Int>>, clipStart: Int, clipEnd: Int): Int {
        if (rawIntervals.isEmpty()) return 0
        if (clipEnd <= clipStart) return 0

        val intervals = rawIntervals
            .mapNotNull { (s, e) ->
                val ns = maxOf(s, clipStart)
                val ne = minOf(e, clipEnd)
                if (ne > ns) ns to ne else null
            }
            .sortedBy { it.first }

        if (intervals.isEmpty()) return 0

        var curStart = intervals[0].first
        var curEnd = intervals[0].second
        var total = 0

        for (i in 1 until intervals.size) {
            val (s, e) = intervals[i]
            if (s <= curEnd) {
                curEnd = maxOf(curEnd, e)
            } else {
                total += (curEnd - curStart)
                curStart = s
                curEnd = e
            }
        }

        total += (curEnd - curStart)
        return total
    }

    /**
     * Utilization definition (per day):
     * - 100% means the room is continuously occupied from the first class start to the last class end.
     * - Gaps reduce the utilization, except for Wednesday 13:00-15:00 which is treated as always occupied
     *   (default academic break) when it lies inside the first..last window.
     */
    fun calculate(day: String): List<RoomUtilizationDto> = transaction {

        val dayKey = day.trim().uppercase()

        val activeRooms = Rooms
            .select { Rooms.active eq true }
            .map { r -> Triple(r[Rooms.id], r[Rooms.name], r[Rooms.type]) }

        // Load all schedules for that day once, then group by room.
        val byRoom: Map<java.util.UUID, List<Pair<Int, Int>>> = Schedules
            .slice(Schedules.roomId, Schedules.timeStart, Schedules.timeEnd)
            .select {
                (Schedules.active eq true) and
                    (Schedules.dayOfWeek eq dayKey) and
                    Schedules.roomId.isNotNull() and
                    Schedules.timeStart.isNotNull() and
                    Schedules.timeEnd.isNotNull()
            }
            .mapNotNull { row ->
                val roomId = row[Schedules.roomId] ?: return@mapNotNull null
                val start = row[Schedules.timeStart] ?: return@mapNotNull null
                val end = row[Schedules.timeEnd] ?: return@mapNotNull null
                if (!end.isAfter(start)) return@mapNotNull null
                roomId to (toMin(start) to toMin(end))
            }
            .groupBy({ it.first }, { it.second })

        activeRooms.map { (roomId, roomName, _) ->
            val intervals = byRoom[roomId].orEmpty()
            if (intervals.isEmpty()) {
                RoomUtilizationDto(roomName = roomName, utilizationPercent = 0)
            } else {
                val minStart = intervals.minOf { it.first }
                val maxEnd = intervals.maxOf { it.second }
                val denom = (maxEnd - minStart).coerceAtLeast(0)

                val extra = if (dayKey == "WEDNESDAY") listOf(13 * 60 to 15 * 60) else emptyList()
                val occupied = sumMergedMinutes(intervals + extra, minStart, maxEnd)

                val pct = if (denom == 0) 0 else ((occupied.toDouble() / denom) * 100).toInt()

                RoomUtilizationDto(
                    roomName = roomName,
                    utilizationPercent = pct.coerceIn(0, 100)
                )
            }
        }
    }

    /**
     * Utilization definition (per week): sums occupied minutes and window minutes across the week
     * and returns occupied/window percent per room.
     */
    fun calculateWeek(days: List<String> = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY")): List<RoomUtilizationDto> = transaction {
        val dayKeys = days.map { it.trim().uppercase() }.filter { it.isNotEmpty() }.distinct()
        if (dayKeys.isEmpty()) return@transaction emptyList()

        val activeRooms = Rooms
            .select { Rooms.active eq true }
            .map { r -> r[Rooms.id] to r[Rooms.name] }

        val raw = Schedules
            .slice(Schedules.roomId, Schedules.dayOfWeek, Schedules.timeStart, Schedules.timeEnd)
            .select {
                (Schedules.active eq true) and
                    (Schedules.dayOfWeek inList dayKeys) and
                    Schedules.roomId.isNotNull() and
                    Schedules.timeStart.isNotNull() and
                    Schedules.timeEnd.isNotNull()
            }
            .mapNotNull { row ->
                val roomId = row[Schedules.roomId] ?: return@mapNotNull null
                val day = row[Schedules.dayOfWeek]?.trim()?.uppercase() ?: return@mapNotNull null
                val start = row[Schedules.timeStart] ?: return@mapNotNull null
                val end = row[Schedules.timeEnd] ?: return@mapNotNull null
                if (!end.isAfter(start)) return@mapNotNull null
                Triple(roomId, day, toMin(start) to toMin(end))
            }

        val byRoom: Map<java.util.UUID, Map<String, List<Pair<Int, Int>>>> =
            raw.groupBy({ it.first }, { it.second to it.third })
                .mapValues { (_, items) -> items.groupBy({ it.first }, { it.second }) }

        activeRooms.map { (roomId, roomName) ->
            val byDay = byRoom[roomId].orEmpty()
            var denomSum = 0
            var occupiedSum = 0

            dayKeys.forEach { dayKey ->
                val intervals = byDay[dayKey].orEmpty()
                if (intervals.isEmpty()) return@forEach

                val minStart = intervals.minOf { it.first }
                val maxEnd = intervals.maxOf { it.second }
                val denom = (maxEnd - minStart).coerceAtLeast(0)
                if (denom == 0) return@forEach

                val extra = if (dayKey == "WEDNESDAY") listOf(13 * 60 to 15 * 60) else emptyList()
                val occupied = sumMergedMinutes(intervals + extra, minStart, maxEnd)

                denomSum += denom
                occupiedSum += occupied
            }

            val pct = if (denomSum == 0) 0 else ((occupiedSum.toDouble() / denomSum) * 100).toInt()
            RoomUtilizationDto(roomName = roomName, utilizationPercent = pct.coerceIn(0, 100))
        }
    }

    /**
     * Week grid: returns per-room per-day utilization plus totals.
     * Used by the dashboard week view (matrix layout).
     */
    fun calculateWeekGrid(days: List<String> = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY")): RoomUtilizationWeekGridResponse = transaction {
        val dayKeys = days.map { it.trim().uppercase() }.filter { it.isNotEmpty() }.distinct()
        if (dayKeys.isEmpty()) {
            return@transaction RoomUtilizationWeekGridResponse(days = emptyList(), overallByDay = emptyMap(), overallTotal = 0, rooms = emptyList())
        }

        val activeRooms = Rooms
            .select { Rooms.active eq true }
            .map { r -> r[Rooms.id] to r[Rooms.name] }

        val raw = Schedules
            .slice(Schedules.roomId, Schedules.dayOfWeek, Schedules.timeStart, Schedules.timeEnd)
            .select {
                (Schedules.active eq true) and
                    (Schedules.dayOfWeek inList dayKeys) and
                    Schedules.roomId.isNotNull() and
                    Schedules.timeStart.isNotNull() and
                    Schedules.timeEnd.isNotNull()
            }
            .mapNotNull { row ->
                val roomId = row[Schedules.roomId] ?: return@mapNotNull null
                val day = row[Schedules.dayOfWeek]?.trim()?.uppercase() ?: return@mapNotNull null
                val start = row[Schedules.timeStart] ?: return@mapNotNull null
                val end = row[Schedules.timeEnd] ?: return@mapNotNull null
                if (!end.isAfter(start)) return@mapNotNull null
                Triple(roomId, day, toMin(start) to toMin(end))
            }

        val byRoom: Map<java.util.UUID, Map<String, List<Pair<Int, Int>>>> =
            raw.groupBy({ it.first }, { it.second to it.third })
                .mapValues { (_, items) -> items.groupBy({ it.first }, { it.second }) }

        val overallDenomByDay = dayKeys.associateWith { 0 }.toMutableMap()
        val overallOccByDay = dayKeys.associateWith { 0 }.toMutableMap()
        var overallDenomTotal = 0
        var overallOccTotal = 0

        val rooms = activeRooms.map { (roomId, roomName) ->
            val byDay = byRoom[roomId].orEmpty()
            var denomSum = 0
            var occSum = 0

            val perDayPct = dayKeys.associateWith { dayKey ->
                val intervals = byDay[dayKey].orEmpty()
                if (intervals.isEmpty()) return@associateWith 0

                val minStart = intervals.minOf { it.first }
                val maxEnd = intervals.maxOf { it.second }
                val denom = (maxEnd - minStart).coerceAtLeast(0)
                if (denom == 0) return@associateWith 0

                val extra = if (dayKey == "WEDNESDAY") listOf(13 * 60 to 15 * 60) else emptyList()
                val occupied = sumMergedMinutes(intervals + extra, minStart, maxEnd)

                denomSum += denom
                occSum += occupied
                overallDenomByDay[dayKey] = (overallDenomByDay[dayKey] ?: 0) + denom
                overallOccByDay[dayKey] = (overallOccByDay[dayKey] ?: 0) + occupied

                val pct = ((occupied.toDouble() / denom) * 100).toInt()
                pct.coerceIn(0, 100)
            }

            overallDenomTotal += denomSum
            overallOccTotal += occSum

            val totalPct = if (denomSum == 0) 0 else ((occSum.toDouble() / denomSum) * 100).toInt().coerceIn(0, 100)
            RoomUtilizationWeekGridRoom(roomName = roomName, byDay = perDayPct, total = totalPct)
        }.sortedBy { it.roomName }

        val overallByDayPct = dayKeys.associateWith { dayKey ->
            val denom = overallDenomByDay[dayKey] ?: 0
            val occ = overallOccByDay[dayKey] ?: 0
            if (denom == 0) 0 else ((occ.toDouble() / denom) * 100).toInt().coerceIn(0, 100)
        }

        val overallTotal = if (overallDenomTotal == 0) 0 else ((overallOccTotal.toDouble() / overallDenomTotal) * 100).toInt().coerceIn(0, 100)

        RoomUtilizationWeekGridResponse(
            days = dayKeys,
            overallByDay = overallByDayPct,
            overallTotal = overallTotal,
            rooms = rooms,
        )
    }
}
