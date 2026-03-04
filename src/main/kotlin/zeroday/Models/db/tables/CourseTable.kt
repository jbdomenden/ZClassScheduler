package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.*
import java.util.UUID

enum class LevelType { TERTIARY, SHS, JHS }

object Courses : Table("courses") {
    val id = uuid("id")
    val code = varchar("code", 20).uniqueIndex()
    val name = varchar("name", 255)
    val levelType = enumerationByName("level_type", 20, LevelType::class)
    val active = bool("active").default(true)

    override val primaryKey = PrimaryKey(id)
}

