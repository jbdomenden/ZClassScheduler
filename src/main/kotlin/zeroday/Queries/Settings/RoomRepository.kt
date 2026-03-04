package zeroday.Queries.Settings

import zeroday.Models.db.tables.RoomType
import zeroday.Models.db.tables.Rooms
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import java.util.*

object RoomRepository {

    fun create(code: String, floor: String, capacity: Int, type: RoomType, active: Boolean = true): UUID = transaction {
        val id = UUID.randomUUID()
        Rooms.insert {
            it[Rooms.id] = id
            it[Rooms.name] = code
            it[Rooms.floor] = floor
            it[Rooms.capacity] = capacity
            it[Rooms.type] = type
            it[Rooms.active] = active
        }
        id
    }

    fun list() = transaction {
        Rooms.select { Rooms.active eq true }
            .map {
                mapOf(
                    "id" to it[Rooms.id].toString(),
                    "code" to it[Rooms.name],
                    "floor" to it[Rooms.floor],
                    "capacity" to it[Rooms.capacity],
                    "type" to it[Rooms.type].name,
                    "status" to if (it[Rooms.active]) "Active" else "Inactive"
                )
            }
    }

    fun listAll() = transaction {
        Rooms.selectAll().map {
            mapOf(
                "id" to it[Rooms.id].toString(),
                "code" to it[Rooms.name],
                "floor" to it[Rooms.floor],
                "capacity" to it[Rooms.capacity],
                "type" to it[Rooms.type].name,
                "status" to if (it[Rooms.active]) "Active" else "Inactive"
            )
        }
    }

    fun update(id: UUID, code: String, floor: String, capacity: Int, type: RoomType, active: Boolean) = transaction {
        Rooms.update({ Rooms.id eq id }) {
            it[Rooms.name] = code
            it[Rooms.floor] = floor
            it[Rooms.capacity] = capacity
            it[Rooms.type] = type
            it[Rooms.active] = active
        }
    }

    fun deactivate(id: UUID) = transaction {
        Rooms.update({ Rooms.id eq id }) {
            it[active] = false
        }
    }
}
