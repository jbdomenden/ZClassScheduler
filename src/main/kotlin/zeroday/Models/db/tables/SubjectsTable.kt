package zeroday.Models.db.tables


import org.jetbrains.exposed.sql.Table


object Subjects : Table("subjects") {
    val id = uuid("id")
    val courseCode = varchar("course_code", 20)
    val curriculumId = uuid("curriculum_id").nullable() // null for JHS
    val code = varchar("code", 50)
    val name = varchar("name", 255)
    val yearTerm = varchar("year_term", 5) // 1**, 2**, ... 8**
    val active = bool("active").default(true)


    override val primaryKey = PrimaryKey(id)
}