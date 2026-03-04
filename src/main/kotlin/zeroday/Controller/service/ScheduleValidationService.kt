package zeroday.Controller.service

import zeroday.Models.db.tables.*
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.SqlExpressionBuilder.greater
import org.jetbrains.exposed.sql.SqlExpressionBuilder.less
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Queries.Settings.RoomBlockRepository
import java.time.LocalTime
import java.util.UUID

object ScheduleValidationService {

    fun validateTime(start: LocalTime, end: LocalTime) {
        require(end.isAfter(start)) { "End time must be after start time" }
        require(start.plusHours(1) <= end) { "Minimum schedule length is 1 hour" }
    }

    private fun isMultipurpose(roomId: UUID): Boolean = transaction {
        Rooms
            .select { Rooms.id eq roomId }
            .singleOrNull()
            ?.get(Rooms.type) == RoomType.MULTIPURPOSE
    }

    fun detectConflict(
        day: String,
        start: LocalTime,
        end: LocalTime,
        roomId: UUID,
        teacherId: UUID,
        courseCode: String,
        section: String
    ): ConflictType? = transaction {

        val timeOverlap =
            (Schedules.dayOfWeek eq day) and
                    (Schedules.timeStart less end) and
                    (Schedules.timeEnd greater start)

        // 1️⃣ Teacher conflict (highest priority)
        if (
            Schedules.select {
                timeOverlap and (Schedules.teacherId eq teacherId)
            }.any()
        ) return@transaction ConflictType.TEACHER

        // 2️⃣ Section conflict
        if (
            Schedules.select {
                timeOverlap and
                        (Schedules.courseCode eq courseCode) and
                        (Schedules.sectionName eq section)
            }.any()
        ) return@transaction ConflictType.SECTION

        // 3️⃣ Room blocked
        if (
            RoomBlockRepository.hasConflict(roomId, day.toInt(), start, end)
        ) return@transaction ConflictType.ROOM_BLOCKED

        // 4️⃣ Room conflict (unless multipurpose)
        val allowRoomOverlap = isMultipurpose(roomId)
        if (!allowRoomOverlap) {
            if (
                Schedules.select {
                    timeOverlap and (Schedules.roomId eq roomId)
                }.any()
            ) return@transaction ConflictType.ROOM
        }

        null
    }
}
