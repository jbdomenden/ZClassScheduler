package zeroday.Models.dto.curriculum

import kotlinx.serialization.Serializable

@Serializable
data class CurriculumResponse(
    val id: String,
    val courseCode: String,
    val name: String,
    val dept: String,
    val active: Boolean
)
