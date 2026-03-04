package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.time
import java.time.LocalTime

object Schedules : Table("schedules") {

    val id = uuid("id")

    val courseCode = varchar("course_code", 20)

    // This becomes the SECTION BLOCK CODE (e.g. BSIT12)
    val section = varchar("section", 50)

    val curriculumId = uuid("curriculum_id").nullable()
    val subjectId = uuid("subject_id")

    val sectionName = varchar("section_name", 50)
    val subjectName = varchar("subject_name", 100)

    val teacherId = uuid("teacher_id").nullable()
    val roomId = uuid("room_id").nullable()

    val dayOfWeek = varchar("day_of_week", 10).nullable()
    val timeStart = time("time_start").nullable()
    val timeEnd = time("time_end").nullable()

    // 🔥 ADD THESE ↓↓↓

    val year = integer("year").default(1)
    val term = integer("term").default(1)

    // 1..8 (year-term index)
    val levelIndex = integer("level_index").default(1)

    val isElective = bool("is_elective").default(false)

    // used when user adds duplicate row
    val isDuplicateRow = bool("is_duplicate_row").default(false)

    val active = bool("active").default(true)

    override val primaryKey = PrimaryKey(id)
}
