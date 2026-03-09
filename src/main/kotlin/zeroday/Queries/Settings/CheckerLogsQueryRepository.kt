package zeroday.Queries.Settings

import org.jetbrains.exposed.sql.SortOrder
import org.jetbrains.exposed.sql.SqlExpressionBuilder.eq
import org.jetbrains.exposed.sql.andWhere
import org.jetbrains.exposed.sql.or
import org.jetbrains.exposed.sql.select
import org.jetbrains.exposed.sql.selectAll
import org.jetbrains.exposed.sql.insert
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.CheckerLogs
import zeroday.Models.db.tables.Rooms
import zeroday.Models.db.tables.Schedules
import zeroday.Models.db.tables.Teachers
import zeroday.Models.dto.checker.CheckerLogItem
import zeroday.Models.dto.checker.CheckerLogListResponse
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.UUID

object CheckerLogsQueryRepository {

    private fun parseDepartments(raw: String?): List<String> =
        (raw ?: "")
            .split(",", ";", "|")
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .map { it.uppercase() }

    fun createFromSchedule(
        scheduleId: UUID,
        checkerUserKey: String,
        checkerEmail: String?,
        status: String,
        present: Boolean,
        note: String?,
    ): UUID = transaction {

        val s = Schedules
            .select { Schedules.id eq scheduleId }
            .limit(1)
            .singleOrNull()
            ?: error("Schedule not found.")

        val teacherId = s[Schedules.teacherId] ?: error("Schedule has no teacher assigned.")
        val roomId = s[Schedules.roomId] ?: error("Schedule has no room assigned.")

        val day = s[Schedules.dayOfWeek]?.trim()?.uppercase() ?: error("Schedule has no day assigned.")
        val ts = s[Schedules.timeStart] ?: error("Schedule has no start time.")
        val te = s[Schedules.timeEnd] ?: error("Schedule has no end time.")

        val teacherRow = Teachers
            .select { Teachers.id eq teacherId }
            .limit(1)
            .singleOrNull()

        val teacherName = teacherRow?.let {
            "${it[Teachers.firstName]} ${it[Teachers.lastName]}".replace("\\s+".toRegex(), " ").trim()
        } ?: ""

        val teacherDeptRaw = teacherRow?.get(Teachers.department) ?: ""
        val deptTokens = parseDepartments(teacherDeptRaw)
        val teacherDeptPrimary = deptTokens.firstOrNull() ?: teacherDeptRaw.trim().uppercase()

        val roomRow = Rooms
            .select { Rooms.id eq roomId }
            .limit(1)
            .singleOrNull()
        val roomCode = roomRow?.get(Rooms.name) ?: ""

        val id = UUID.randomUUID()
        val now = LocalDateTime.ofInstant(Instant.now(), ZoneId.systemDefault())

        CheckerLogs.insert {
            it[CheckerLogs.id] = id
            it[timestamp] = now
            it[CheckerLogs.checkerUserKey] = checkerUserKey
            it[CheckerLogs.checkerEmail] = checkerEmail
            it[CheckerLogs.scheduleId] = scheduleId
            it[CheckerLogs.teacherId] = teacherId
            it[CheckerLogs.teacherName] = teacherName
            it[teacherDepartment] = teacherDeptRaw
            it[teacherDepartmentPrimary] = teacherDeptPrimary
            it[CheckerLogs.roomId] = roomId
            it[CheckerLogs.roomCode] = roomCode
            it[CheckerLogs.courseCode] = s[Schedules.courseCode]
            it[CheckerLogs.sectionName] = s[Schedules.sectionName]
            it[CheckerLogs.subjectName] = s[Schedules.subjectName]
            it[dayOfWeek] = day
            it[timeStart] = ts
            it[timeEnd] = te
            it[CheckerLogs.status] = status
            it[CheckerLogs.present] = present
            it[CheckerLogs.note] = note?.trim()?.takeIf { it.isNotEmpty() }?.take(500)
        }

        id
    }

    fun list(
        limit: Int,
        offset: Long,
        q: String? = null,
        status: String? = null,
        present: Boolean? = null,
        checkerUserKey: String? = null,
        allowedTeacherDepartments: Set<String>? = null,
    ): CheckerLogListResponse = transaction {

        val safeLimit = limit.coerceIn(1, 500)
        val safeOffset = offset.coerceAtLeast(0)

        val query = CheckerLogs.selectAll()

        status?.trim()?.takeIf { it.isNotEmpty() }?.let { s ->
            query.andWhere { CheckerLogs.status eq s }
        } ?: run {
            present?.let { p ->
                query.andWhere { CheckerLogs.present eq p }
            }
        }
        checkerUserKey?.trim()?.takeIf { it.isNotEmpty() }?.let { ck ->
            query.andWhere { CheckerLogs.checkerUserKey eq ck }
        }
        allowedTeacherDepartments?.takeIf { it.isNotEmpty() }?.let { allowed ->
            query.andWhere { CheckerLogs.teacherDepartmentPrimary inList allowed.toList() }
        }
        q?.trim()?.takeIf { it.isNotEmpty() }?.let { term ->
            val like = "%$term%"
            query.andWhere {
                (CheckerLogs.checkerUserKey like like) or
                    (CheckerLogs.checkerEmail like like) or
                    (CheckerLogs.teacherName like like) or
                    (CheckerLogs.teacherDepartment like like) or
                    (CheckerLogs.roomCode like like) or
                    (CheckerLogs.courseCode like like) or
                    (CheckerLogs.sectionName like like) or
                    (CheckerLogs.subjectName like like) or
                    (CheckerLogs.note like like)
            }
        }

        val rows = query
            .orderBy(CheckerLogs.timestamp to SortOrder.DESC)
            .limit(safeLimit + 1, offset = safeOffset)
            .toList()

        val hasMore = rows.size > safeLimit
        val pageRows = if (hasMore) rows.dropLast(1) else rows

        val checkerEmails = pageRows
            .mapNotNull { it[CheckerLogs.checkerEmail]?.trim()?.lowercase()?.takeIf { e -> e.isNotEmpty() } }
            .distinct()

        val checkerNameByEmail = if (checkerEmails.isEmpty()) {
            emptyMap()
        } else {
            Teachers
                .slice(Teachers.email, Teachers.name, Teachers.firstName, Teachers.lastName)
                .select { Teachers.email inList checkerEmails }
                .associate { tr ->
                    val email = tr[Teachers.email].trim().lowercase()
                    val name = tr[Teachers.name].trim().ifEmpty {
                        "${tr[Teachers.firstName]} ${tr[Teachers.lastName]}".replace("\\s+".toRegex(), " ").trim()
                    }
                    email to name
                }
        }

        val items = pageRows.map { r ->
            val rawStatus = runCatching { r[CheckerLogs.status] }.getOrNull()
            val normStatus = rawStatus?.trim()?.uppercase().orEmpty()
            val fallbackStatus = if (r[CheckerLogs.present]) "PRESENT" else "ABSENT"
            val finalStatus = if (normStatus.isNotEmpty()) normStatus else fallbackStatus
            val ckEmailNorm = r[CheckerLogs.checkerEmail]?.trim()?.lowercase()

            CheckerLogItem(
                id = r[CheckerLogs.id].toString(),
                timestamp = r[CheckerLogs.timestamp].toString(),
                checkerUserKey = r[CheckerLogs.checkerUserKey],
                checkerEmail = r[CheckerLogs.checkerEmail],
                checkerName = ckEmailNorm?.let { checkerNameByEmail[it] },
                scheduleId = r[CheckerLogs.scheduleId]?.toString(),
                teacherId = r[CheckerLogs.teacherId]?.toString(),
                teacherName = r[CheckerLogs.teacherName],
                teacherDepartment = r[CheckerLogs.teacherDepartment],
                roomId = r[CheckerLogs.roomId]?.toString(),
                roomCode = r[CheckerLogs.roomCode],
                courseCode = r[CheckerLogs.courseCode],
                sectionName = r[CheckerLogs.sectionName],
                subjectName = r[CheckerLogs.subjectName],
                dayOfWeek = r[CheckerLogs.dayOfWeek],
                timeStart = r[CheckerLogs.timeStart].toString(),
                timeEnd = r[CheckerLogs.timeEnd].toString(),
                status = finalStatus,
                present = r[CheckerLogs.present],
                note = r[CheckerLogs.note],
            )
        }

        CheckerLogListResponse(
            items = items,
            limit = safeLimit,
            offset = safeOffset,
            nextOffset = if (hasMore) (safeOffset + safeLimit) else null,
        )
    }
}
