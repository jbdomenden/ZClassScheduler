package zeroday.Models.db.tables


import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.time


enum class TeacherBlockType {
    ADMIN,
    BREAK,
    REST_DAY
}


object TeacherBlocks : Table("teacher_blocks") {
    val id = uuid("id")
    val teacherId = uuid("teacher_id")
    val type = enumerationByName("type", 10, TeacherBlockType::class)
    val dayOfWeek = varchar("day_of_week", 10)
    val timeStart = time("time_start")
    val timeEnd = time("time_end")


    override val primaryKey = PrimaryKey(id)
}
