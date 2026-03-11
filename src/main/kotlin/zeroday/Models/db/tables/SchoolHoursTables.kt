package zeroday.Models.db.tables

import org.jetbrains.exposed.sql.Table
import org.jetbrains.exposed.sql.javatime.date
import org.jetbrains.exposed.sql.javatime.time
import org.jetbrains.exposed.sql.javatime.timestamp
import java.util.UUID

object SchoolHoursSettings : Table("school_hours_settings") {
    val id = uuid("id")
    val currentSchoolYear = varchar("current_school_year", 30)
    val currentTerm = varchar("current_term", 20)
    val timezone = varchar("timezone", 60).default("Asia/Manila")
    val isActive = bool("is_active").default(true)
    val effectiveFrom = date("effective_from")
    val effectiveTo = date("effective_to").nullable()
    val createdBy = varchar("created_by", 120).nullable()
    val updatedBy = varchar("updated_by", 120).nullable()
    val createdAt = timestamp("created_at")
    val updatedAt = timestamp("updated_at")
    override val primaryKey = PrimaryKey(id)
}

object SchoolDayRules : Table("school_day_rules") {
    val id = uuid("id")
    val schoolHoursSettingsId = uuid("school_hours_settings_id")
    val dayOfWeek = varchar("day_of_week", 10)
    val isOpen = bool("is_open").default(true)
    val timeStart = time("time_start")
    val timeEnd = time("time_end")
    override val primaryKey = PrimaryKey(id)
}

object AcademicBreaks : Table("academic_breaks") {
    val id = uuid("id")
    val schoolHoursSettingsId = uuid("school_hours_settings_id")
    val title = varchar("title", 120)
    val breakType = varchar("break_type", 40).default("GENERAL")
    val dayOfWeek = varchar("day_of_week", 10).nullable()
    val timeStart = time("time_start")
    val timeEnd = time("time_end")
    val appliesToSections = bool("applies_to_sections").default(true)
    val appliesToRooms = bool("applies_to_rooms").default(true)
    val appliesToTeachers = bool("applies_to_teachers").default(true)
    val isActive = bool("is_active").default(true)
    val notes = text("notes").nullable()
    override val primaryKey = PrimaryKey(id)
}

data class ActiveAcademicPeriod(val schoolYear: String, val term: String)
