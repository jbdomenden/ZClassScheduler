package zeroday.Models.db.models

class Schedule(
    section: String,
    curriculum: String,
    code: String,
    subject: String,
    type: String,
    day: String,
    end: String,
    start: String,
    teacherDept: String,
    room: String,
    teacherFN: String,
    teacherLN: String
) {

        val  section: String = section
        val curriculum: String = curriculum
        val code: String = code
        val subject: String = subject
        val type: String = type
        val day: String = day
        val start: String = start
        val end: String = end
        val room: String = room
        val teacherDept: String = teacherDept
        val teacherFN: String = teacherFN
        val teacherLN: String = teacherLN

}