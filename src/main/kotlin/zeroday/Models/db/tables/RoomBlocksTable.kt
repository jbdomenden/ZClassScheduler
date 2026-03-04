package zeroday.Models.db.tables


import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.javatime.time
import java.util.*


enum class RoomBlockType { MAINTENANCE, EVENT, CLOSED }


object RoomBlocks : Table("room_blocks") {
    val id = uuid("id")
    val roomId = uuid("room_id")
    val dayOfWeek = integer("day_of_week") // 1 = Monday
    val timeStart = time("time_start")
    val timeEnd = time("time_end")
    val type = enumerationByName("type", 20, RoomBlockType::class)


    override val primaryKey = PrimaryKey(id)
}