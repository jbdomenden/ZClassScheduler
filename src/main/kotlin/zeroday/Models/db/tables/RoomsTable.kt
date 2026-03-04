package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table
import java.util.*

enum class RoomType { LECTURE, LAB, MULTIPURPOSE }

object Rooms : Table("rooms") {

    val id = uuid("id")
    // UI calls this "Room Code"; historically this was named "name".
    // Keep the column name for compatibility, but treat it as room code.
    val name = varchar("name", 100).uniqueIndex()
    // Additional fields used by the Manage Rooms screen
    val floor = varchar("floor", 20).default("")
    val capacity = integer("capacity").default(0)
    val type = enumerationByName("type", 20, RoomType::class)
    val active = bool("active").default(true)

    override val primaryKey = PrimaryKey(id)
}
