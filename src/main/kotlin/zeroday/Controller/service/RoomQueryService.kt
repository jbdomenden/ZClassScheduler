package zeroday.Controller.service

import zeroday.Models.db.tables.Rooms
import zeroday.Models.db.tables.Schedules
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalDate
import java.time.LocalTime

object RoomQueryService {

    fun activeRooms(day: String, time: LocalTime) = transaction {
        Rooms.innerJoin(Schedules)
            .select {
                (Schedules.dayOfWeek eq day) and
                        (Schedules.timeStart lessEq time) and
                        (Schedules.timeEnd greater time)
            }
            .map { it[Rooms.name] }
            .distinct()
    }

    fun freeRooms(day: String, time: LocalTime) = transaction {
        val occupied = Schedules
            .slice(Schedules.roomId)
            .select {
                (Schedules.dayOfWeek eq day) and
                        (Schedules.timeStart lessEq time) and
                        (Schedules.timeEnd greater time)
            }

        Rooms
            .select { Rooms.id notInSubQuery occupied }
            .map { it[Rooms.name] }
    }
}
