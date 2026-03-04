package zeroday.Queries.Settings


import zeroday.Models.db.tables.RoomBlocks
import zeroday.Models.db.tables.RoomBlockType
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.time.LocalTime
import java.util.*


object RoomBlockRepository {


    fun hasConflict(roomId: UUID, day: Int, start: LocalTime, end: LocalTime): Boolean = transaction {
        RoomBlocks.select {
            (RoomBlocks.roomId eq roomId) and
                    (RoomBlocks.dayOfWeek eq day) and
                    (RoomBlocks.timeStart less end) and
                    (RoomBlocks.timeEnd greater start)
        }.count() > 0
    }


    fun create(roomId: UUID, day: Int, start: LocalTime, end: LocalTime, type: RoomBlockType) = transaction {
        RoomBlocks.insert {
            it[id] = UUID.randomUUID()
            it[RoomBlocks.roomId] = roomId
            it[dayOfWeek] = day
            it[timeStart] = start
            it[timeEnd] = end
            it[RoomBlocks.type] = type
        }
    }
}