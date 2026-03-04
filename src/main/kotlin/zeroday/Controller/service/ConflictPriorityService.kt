package zeroday.Controller.service

import zeroday.Controller.service.ConflictType.*

object ConflictPriorityService {

    fun resolve(type: ConflictType): ConflictPriority =
        when (type) {
            ROOM_TEACHER -> ConflictPriority.HIGH
            TEACHER -> ConflictPriority.MEDIUM
            SECTION -> ConflictPriority.LOW
            MULTIPURPOSE_ALLOWED -> ConflictPriority.INFO
            ROOM -> ConflictPriority.MEDIUM
            ROOM_BLOCKED -> ConflictPriority.LOW
            UNKNOWN -> ConflictPriority.LOW
        }


    fun label(type: ConflictType): String =
        when (type) {
            ROOM_TEACHER -> "Room & Teacher conflict"
            TEACHER -> "Teacher double-booked"
            SECTION -> "Section overlap"
            MULTIPURPOSE_ALLOWED -> "Multipurpose room overlap (allowed)"
            ROOM -> "Room conflict"
            ROOM_BLOCKED -> "Room blocked"
            UNKNOWN -> "Unknown"
        }
}
