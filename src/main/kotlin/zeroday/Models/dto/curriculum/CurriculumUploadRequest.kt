package zeroday.Models.dto.curriculum

import kotlinx.serialization.Serializable

@Serializable
data class CurriculumUploadRequest(
    val courseCode: String,
    /** e.g. BSCS-24-01 */
    val name: String,
    /** Department bucket: TERTIARY_STI | TERTIARY_NAMEI | JHS | SHS */
    val dept: String = "TERTIARY_STI",
    val subjects: List<CurriculumSubjectItem>
)

@Serializable
data class CurriculumSubjectItem(
    /** e.g. CITE1004 */
    val code: String,
    /** e.g. Introduction to Computing */
    val name: String,
    /** 1..8 (Y1T1..Y4T2) */
    val yearTerm: String
)
