package zeroday.Controller.service

import zeroday.Models.db.tables.Rooms
import zeroday.Models.db.tables.Schedules
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

object RoomAvailabilityService {

    fun getFreeRoomsNow(): List<String> = transaction {
        val now = LocalTime.now()
        val today = LocalDate.now().dayOfWeek.name

        val occupiedRoomIds: List<UUID> = Schedules
            .slice(Schedules.roomId)
            .select {
                (Schedules.dayOfWeek eq today) and
                        (Schedules.timeStart less now) and
                        (Schedules.timeEnd greater now)
            }
            .mapNotNull { it[Schedules.roomId] } // ✅ UUID?
            .distinct()

        Rooms
            .select { Rooms.id notInList occupiedRoomIds }
            .map { it[Rooms.name] }
    }
}
