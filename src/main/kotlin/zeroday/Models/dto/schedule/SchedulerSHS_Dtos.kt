package zeroday.Models.dto.schedule

import kotlinx.serialization.Serializable

@Serializable
data class ShsCreateBlockRequest(
    val courseCode: String,
    val curriculumId: String,
    val grade: Int, // 11..12
    val term: Int   // 1..2
)
