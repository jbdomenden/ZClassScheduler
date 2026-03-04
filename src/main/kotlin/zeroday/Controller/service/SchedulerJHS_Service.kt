package zeroday.Controller.service

import zeroday.Queries.Schedules.SchedulerJHS_Repository
import java.util.UUID

object SchedulerJHS_Service {
    fun createBlock(curriculumId: UUID, grade: Int, sectionCode: String) {
        require(sectionCode.isNotBlank()) { "Section code is required" }
        require(grade in 7..10) { "Grade must be 7..10" }
        SchedulerJHS_Repository.createBlock(curriculumId, grade, sectionCode.trim())
    }
}