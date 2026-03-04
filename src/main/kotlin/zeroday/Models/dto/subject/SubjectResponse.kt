package zeroday.Models.dto.subject


import kotlinx.serialization.Serializable


@Serializable
data class SubjectResponse(
    val id: String,
    val courseCode: String,
    val curriculumId: String?,
    val code: String,
    val name: String,
    val yearTerm: String,
    val active: Boolean
)