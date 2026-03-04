package zeroday.Controller.service

import zeroday.Models.db.tables.*
import zeroday.Models.dto.dashboard.RoomUtilizationDto
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.Duration

object RoomUtilizationService {

    fun calculate(): List<RoomUtilizationDto> = transaction {

        val totalAvailable = SchoolHoursService.totalMinutes()

        Rooms.selectAll().map { room ->

            val roomId = room[Rooms.id]
            val roomName = room[Rooms.name]

            val scheduledMinutes = Schedules
                .select { Schedules.roomId eq roomId }
                .sumOf {
                    Duration.between(
                        it[Schedules.timeStart],
                        it[Schedules.timeEnd]
                    ).toMinutes()
                }

            val utilization = if (totalAvailable == 0L) 0
            else ((scheduledMinutes.toDouble() / totalAvailable) * 100).toInt()

            RoomUtilizationDto(
                roomName = roomName,
                utilizationPercent = utilization.coerceAtMost(100)
            )
        }
    }
}
