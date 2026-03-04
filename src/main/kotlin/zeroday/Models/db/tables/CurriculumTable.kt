package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table
import java.util.UUID

object Curriculums : Table("curriculums") {
    val id = uuid("id")
    val courseCode = varchar("course_code", 20) // FK by code (BT, BSIT, HUMSS, G7)
    val name = varchar("name", 255) // e.g. BSIT 2024 Curriculum

    // Department bucket for curriculum filtering/ownership
    // Allowed values: TERTIARY_STI | TERTIARY_NAMEI | JHS | SHS
    val dept = varchar("dept", 30).default("TERTIARY_STI")

    val active = bool("active").default(true)

    override val primaryKey = PrimaryKey(id)
}
