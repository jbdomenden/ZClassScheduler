package zeroday.Controller.service

import zeroday.Models.dto.ConflictPromptDto
import zeroday.Models.db.tables.RoomType
import zeroday.Models.db.tables.Rooms
import zeroday.Models.db.tables.Schedules
import zeroday.Models.db.tables.Teachers
import org.jetbrains.exposed.sql.*
import org.jetbrains.exposed.sql.transactions.transaction

object DashboardConflictService {

    private data class Item(
        val id: java.util.UUID,
        val day: String,
        val startMin: Int,
        val endMin: Int,
        val courseCode: String,
        val sectionName: String,
        val subjectName: String,
        val roomId: java.util.UUID?,
        val roomCode: String?,
        val roomType: RoomType?,
        val teacherId: java.util.UUID?,
        val teacherName: String?
    )

    private fun overlap(a: Item, b: Item): Boolean =
        a.startMin < b.endMin && b.startMin < a.endMin

    private fun fmt(min: Int): String {
        val h = min / 60
        val m = min % 60
        return "%02d:%02d".format(h, m)
    }

    private fun itemLabel(i: Item): String =
        "${i.courseCode} ${i.sectionName} - ${i.subjectName}".trim()

    fun scheduleConflicts(limit: Int = 500): List<ConflictPromptDto> = transaction {
        val join = Schedules
            .join(Rooms, JoinType.LEFT, additionalConstraint = { Schedules.roomId eq Rooms.id })
            .join(Teachers, JoinType.LEFT, additionalConstraint = { Schedules.teacherId eq Teachers.id })

        val items = join
            .select {
                (Schedules.active eq true) and
                    Schedules.dayOfWeek.isNotNull() and
                    Schedules.timeStart.isNotNull() and
                    Schedules.timeEnd.isNotNull()
            }
            .mapNotNull { row ->
                val day = row[Schedules.dayOfWeek] ?: return@mapNotNull null
                val ts = row[Schedules.timeStart] ?: return@mapNotNull null
                val te = row[Schedules.timeEnd] ?: return@mapNotNull null
                if (!te.isAfter(ts)) return@mapNotNull null

                val teacherId = row[Schedules.teacherId]
                val teacherName = teacherId?.let {
                    "${row[Teachers.firstName]} ${row[Teachers.lastName]}".replace("\\s+".toRegex(), " ").trim()
                }

                val roomId = row[Schedules.roomId]
                val roomCode = roomId?.let { row[Rooms.name] }
                val roomType = roomId?.let { row[Rooms.type] }

                Item(
                    id = row[Schedules.id],
                    day = day,
                    startMin = ts.hour * 60 + ts.minute,
                    endMin = te.hour * 60 + te.minute,
                    courseCode = row[Schedules.courseCode],
                    sectionName = row[Schedules.sectionName],
                    subjectName = row[Schedules.subjectName],
                    roomId = roomId,
                    roomCode = roomCode,
                    roomType = roomType,
                    teacherId = teacherId,
                    teacherName = teacherName
                )
            }

        val out = mutableListOf<ConflictPromptDto>()

        fun addConflict(type: ConflictType, day: String, start: Int, end: Int, details: String) {
            out.add(
                ConflictPromptDto(
                    priority = ConflictPriorityService.resolve(type).name,
                    message = "${ConflictPriorityService.label(type)}: $details",
                    timestamp = "$day ${fmt(start)}-${fmt(end)}"
                )
            )
        }

        fun <K> detect(groups: Map<K, List<Item>>, type: ConflictType, describe: (Item, Item) -> String) {
            groups.values.forEach { group ->
                val sorted = group.sortedBy { it.startMin }
                for (i in 0 until sorted.size) {
                    val a = sorted[i]
                    var j = i + 1
                    while (j < sorted.size && sorted[j].startMin < a.endMin) {
                        val b = sorted[j]
                        if (overlap(a, b)) {
                            val os = maxOf(a.startMin, b.startMin)
                            val oe = minOf(a.endMin, b.endMin)
                            addConflict(type, a.day, os, oe, describe(a, b))
                        }
                        j++
                    }
                }
            }
        }

        // Teacher overlaps (all days)
        detect(
            items.filter { it.teacherId != null }
                .groupBy { it.day to it.teacherId },
            ConflictType.TEACHER
        ) { a, b ->
            val who = a.teacherName ?: "Teacher"
            "$who has overlapping schedules (${fmt(a.startMin)}-${fmt(a.endMin)} ${itemLabel(a)}) and (${fmt(b.startMin)}-${fmt(b.endMin)} ${itemLabel(b)})"
        }

        // Room overlaps (ignore multipurpose rooms)
        detect(
            items.filter { it.roomId != null && it.roomType != RoomType.MULTIPURPOSE }
                .groupBy { it.day to it.roomId },
            ConflictType.ROOM
        ) { a, b ->
            val room = a.roomCode ?: "Room"
            "$room has overlapping schedules (${fmt(a.startMin)}-${fmt(a.endMin)} ${itemLabel(a)}) and (${fmt(b.startMin)}-${fmt(b.endMin)} ${itemLabel(b)})"
        }

        // Section overlaps (same courseCode + sectionName)
        detect(
            items.groupBy { Triple(it.day, it.courseCode, it.sectionName) },
            ConflictType.SECTION
        ) { a, b ->
            "${a.courseCode} ${a.sectionName} has overlapping schedules (${fmt(a.startMin)}-${fmt(a.endMin)} ${a.subjectName}) and (${fmt(b.startMin)}-${fmt(b.endMin)} ${b.subjectName})"
        }

        out
            .sortedWith(compareBy<ConflictPromptDto>({ it.timestamp }, { it.priority }, { it.message }))
            .take(limit.coerceIn(1, 2000))
    }
}
