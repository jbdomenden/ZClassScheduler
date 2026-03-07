package zeroday.Models.dto.schedule

import kotlinx.serialization.Serializable

@Serializable
data class TertiaryCreateBlockRequest(
    val courseCode: String,     // e.g. BI, BSIT, BC
    val curriculumId: String,   // UUID string
    val year: Int,              // 1..4
    val term: Int               // 1..2
)

@Serializable
data class TertiaryBlockResponse(
    val sectionCode: String,
    val courseCode: String,
    val curriculumId: String?,
    val curriculumName: String?,
    val year: Int,
    val term: Int,
    val levelIndex: Int,
    val active: Boolean,
    val rows: List<TertiaryRowResponse>
)

@Serializable
data class TertiaryRowResponse(
    val id: String,
    val subjectId: String,
    val subjectCode: String,    // ✅ added (curriculum subject code)
    val subjectName: String,    // ✅ description
    val isElective: Boolean,
    val dayOfWeek: String?,
    val timeStart: String?,
    val timeEnd: String?,
    val roomId: String?,
    val teacherId: String?,
    val active: Boolean,
    // True only for rows created via "Add Row" (duplicate) action.
    val isDuplicateRow: Boolean = false
)

