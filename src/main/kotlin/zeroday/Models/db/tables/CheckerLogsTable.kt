package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.datetime
import org.jetbrains.exposed.sql.javatime.time

object CheckerLogs : Table("checker_logs") {
    val id = uuid("id")

    val timestamp = datetime("timestamp")

    val checkerUserKey = varchar("checker_user_key", 80)
    val checkerEmail = varchar("checker_email", 255).nullable()

    val scheduleId = uuid("schedule_id").nullable()

    val teacherId = uuid("teacher_id").nullable()
    val teacherName = varchar("teacher_name", 140).default("")
    // Snapshot of the teacher's department at the time of check.
    val teacherDepartment = varchar("teacher_department", 80).default("")
    // Primary department token (used for filtering for ADMIN scope).
    val teacherDepartmentPrimary = varchar("teacher_department_primary", 50).default("")

    val roomId = uuid("room_id").nullable()
    val roomCode = varchar("room_code", 50).default("")

    val courseCode = varchar("course_code", 20).default("")
    val sectionName = varchar("section_name", 50).default("")
    val subjectName = varchar("subject_name", 100).default("")

    val dayOfWeek = varchar("day_of_week", 10)
    val timeStart = time("time_start")
    val timeEnd = time("time_end")

    // PRESENT | ABSENT | NOT_IN_CLASS
    // Nullable for backward compatibility with existing rows created before this column existed.
    val status = varchar("status", 20).nullable()
    val present = bool("present")
    val note = varchar("note", 500).nullable()

    override val primaryKey = PrimaryKey(id)
}
