package zeroday.Models.dto.curriculum

import kotlinx.serialization.Serializable

@Serializable
data class CurriculumRequest(
    val courseCode: String,
    val name: String,
    /** Department bucket: TERTIARY_STI | TERTIARY_NAMEI | JHS | SHS */
    val dept: String = "TERTIARY_STI"
)
