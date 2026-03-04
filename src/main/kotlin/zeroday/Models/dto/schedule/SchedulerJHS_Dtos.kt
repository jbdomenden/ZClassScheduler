package zeroday.Models.dto.schedule

import kotlinx.serialization.Serializable

@Serializable
data class JhsCreateBlockRequest(
    val curriculumId: String,
    val grade: Int,
    // user types: "ALPHA-01", "RIZAL", etc.
    val sectionName: String
)

@Serializable
data class JhsBlockResponse(
    // rendered section label shown in UI (e.g. "G7-ALPHA-01")
    val section: String,
    val grade: Int,
    val curriculumName: String,
    val program: String,
    val status: String,
    val rows: List<JhsRowResponse>
)

@Serializable
data class JhsRowResponse(
    val id: String,
    val subjectCode: String,
    val subjectName: String,
    val dayOfWeek: String? = null,
    val timeStart: String? = null,
    val timeEnd: String? = null,
    val roomId: String? = null,
    val teacherId: String? = null,
    val isDuplicateRow: Boolean = false
)

