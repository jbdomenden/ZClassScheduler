package zeroday.Queries.Settings

import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.*
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.util.UUID

object SchoolHoursRepository {

    data class DayRuleDto(val dayOfWeek: String, val isOpen: Boolean, val timeStart: String, val timeEnd: String)
    data class BreakDto(
        val id: String,
        val title: String,
        val breakType: String,
        val dayOfWeek: String?,
        val timeStart: String,
        val timeEnd: String,
        val notes: String?
    )

    fun getActivePeriod(): ActiveAcademicPeriod? = transaction {
        SchoolHoursSettings.select { SchoolHoursSettings.isActive eq true }
            .orderBy(SchoolHoursSettings.updatedAt to SortOrder.DESC)
            .limit(1)
            .singleOrNull()
            ?.let { ActiveAcademicPeriod(it[SchoolHoursSettings.currentSchoolYear], it[SchoolHoursSettings.currentTerm]) }
    }

    fun getActiveConfig(): Map<String, Any?>? = transaction {
        val cfg = SchoolHoursSettings.select { SchoolHoursSettings.isActive eq true }
            .orderBy(SchoolHoursSettings.updatedAt to SortOrder.DESC)
            .limit(1)
            .singleOrNull() ?: return@transaction null
        val id = cfg[SchoolHoursSettings.id]
        val rules = SchoolDayRules.select { SchoolDayRules.schoolHoursSettingsId eq id }
            .map {
                mapOf(
                    "id" to it[SchoolDayRules.id].toString(),
                    "dayOfWeek" to it[SchoolDayRules.dayOfWeek],
                    "isOpen" to it[SchoolDayRules.isOpen],
                    "timeStart" to it[SchoolDayRules.timeStart].toString(),
                    "timeEnd" to it[SchoolDayRules.timeEnd].toString()
                )
            }
        val breaks = AcademicBreaks.select { (AcademicBreaks.schoolHoursSettingsId eq id) and (AcademicBreaks.isActive eq true) }
            .map {
                mapOf(
                    "id" to it[AcademicBreaks.id].toString(),
                    "title" to it[AcademicBreaks.title],
                    "breakType" to it[AcademicBreaks.breakType],
                    "dayOfWeek" to it[AcademicBreaks.dayOfWeek],
                    "timeStart" to it[AcademicBreaks.timeStart].toString(),
                    "timeEnd" to it[AcademicBreaks.timeEnd].toString(),
                    "notes" to it[AcademicBreaks.notes],
                )
            }
        mapOf(
            "id" to id.toString(),
            "currentSchoolYear" to cfg[SchoolHoursSettings.currentSchoolYear],
            "currentTerm" to cfg[SchoolHoursSettings.currentTerm],
            "timezone" to cfg[SchoolHoursSettings.timezone],
            "rules" to rules,
            "breaks" to breaks,
        )
    }

    fun upsertActive(
        schoolYear: String,
        term: String,
        timezone: String,
        dayRules: List<DayRuleDto>,
        actor: String?
    ): UUID = transaction {
        require(dayRules.any { it.isOpen }) { "At least one open school day is required." }

        val now = Instant.now()
        val active = SchoolHoursSettings.select { SchoolHoursSettings.isActive eq true }.limit(1).singleOrNull()
        val id = active?.get(SchoolHoursSettings.id) ?: UUID.randomUUID()

        if (active == null) {
            SchoolHoursSettings.insert {
                it[SchoolHoursSettings.id] = id
                it[currentSchoolYear] = schoolYear.trim()
                it[currentTerm] = term.trim()
                it[SchoolHoursSettings.timezone] = timezone.trim().ifBlank { "Asia/Manila" }
                it[isActive] = true
                it[effectiveFrom] = LocalDate.now()
                it[createdBy] = actor
                it[updatedBy] = actor
                it[createdAt] = now
                it[updatedAt] = now
            }
        } else {
            SchoolHoursSettings.update({ SchoolHoursSettings.id eq id }) {
                it[currentSchoolYear] = schoolYear.trim()
                it[currentTerm] = term.trim()
                it[SchoolHoursSettings.timezone] = timezone.trim().ifBlank { "Asia/Manila" }
                it[updatedBy] = actor
                it[updatedAt] = now
            }
        }

        SchoolDayRules.deleteWhere { SchoolDayRules.schoolHoursSettingsId eq id }
        dayRules.forEach { d ->
            val s = LocalTime.parse(d.timeStart)
            val e = LocalTime.parse(d.timeEnd)
            require(s < e) { "Invalid school day range for ${d.dayOfWeek}." }
            SchoolDayRules.insert {
                it[SchoolDayRules.id] = UUID.randomUUID()
                it[schoolHoursSettingsId] = id
                it[dayOfWeek] = d.dayOfWeek.trim().uppercase()
                it[isOpen] = d.isOpen
                it[timeStart] = s
                it[timeEnd] = e
            }
        }

        id
    }

    fun addBreak(
        settingsId: UUID,
        title: String,
        breakType: String,
        dayOfWeek: String?,
        timeStart: String,
        timeEnd: String,
        notes: String?
    ): UUID = transaction {
        val s = LocalTime.parse(timeStart)
        val e = LocalTime.parse(timeEnd)
        require(s < e) { "Break start must be earlier than break end." }

        val id = UUID.randomUUID()
        AcademicBreaks.insert {
            it[AcademicBreaks.id] = id
            it[schoolHoursSettingsId] = settingsId
            it[AcademicBreaks.title] = title.trim()
            it[AcademicBreaks.breakType] = breakType.trim().ifBlank { "GENERAL" }
            it[AcademicBreaks.dayOfWeek] = dayOfWeek?.trim()?.uppercase()?.ifBlank { null }
            it[AcademicBreaks.timeStart] = s
            it[AcademicBreaks.timeEnd] = e
            it[AcademicBreaks.notes] = notes
        }
        id
    }

    fun listBreaks(settingsId: UUID): List<BreakDto> = transaction {
        AcademicBreaks.select { (AcademicBreaks.schoolHoursSettingsId eq settingsId) and (AcademicBreaks.isActive eq true) }
            .map {
                BreakDto(
                    id = it[AcademicBreaks.id].toString(),
                    title = it[AcademicBreaks.title],
                    breakType = it[AcademicBreaks.breakType],
                    dayOfWeek = it[AcademicBreaks.dayOfWeek],
                    timeStart = it[AcademicBreaks.timeStart].toString(),
                    timeEnd = it[AcademicBreaks.timeEnd].toString(),
                    notes = it[AcademicBreaks.notes],
                )
            }
    }

    fun validateSlot(dayOfWeek: String, start: LocalTime, end: LocalTime): String? = transaction {
        val cfg = SchoolHoursSettings.select { SchoolHoursSettings.isActive eq true }
            .orderBy(SchoolHoursSettings.updatedAt to SortOrder.DESC)
            .limit(1)
            .singleOrNull() ?: return@transaction "No active school year and term configured. Please contact SUPER_ADMIN or ACADEMIC_HEAD."

        val sid = cfg[SchoolHoursSettings.id]
        val day = dayOfWeek.trim().uppercase()

        val rule = SchoolDayRules.select {
            (SchoolDayRules.schoolHoursSettingsId eq sid) and
                    (SchoolDayRules.dayOfWeek eq day)
        }.limit(1).singleOrNull() ?: return@transaction "No school-hour rule for $day."

        if (!rule[SchoolDayRules.isOpen]) return@transaction "$day is closed in school-hours settings."

        val rs = rule[SchoolDayRules.timeStart]
        val re = rule[SchoolDayRules.timeEnd]
        if (start < rs || end > re) {
            return@transaction "Schedule is outside school operating hours ($rs - $re)."
        }

        val conflictBreak = AcademicBreaks.select {
            (AcademicBreaks.schoolHoursSettingsId eq sid) and
                    (AcademicBreaks.isActive eq true) and
                    ((AcademicBreaks.dayOfWeek eq day) or AcademicBreaks.dayOfWeek.isNull())
        }.firstOrNull { b ->
            val bs = b[AcademicBreaks.timeStart]
            val be = b[AcademicBreaks.timeEnd]
            start < be && bs < end
        }

        if (conflictBreak != null) {
            return@transaction "Selected schedule overlaps with protected academic break: ${conflictBreak[AcademicBreaks.timeStart]} - ${conflictBreak[AcademicBreaks.timeEnd]}"
        }

        null
    }
}
