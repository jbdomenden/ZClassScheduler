package zeroday.Models.dto.subject


import kotlinx.serialization.Serializable


@Serializable
data class SubjectRequest(
    val courseCode: String,
    val curriculumId: String?,
    val code: String,
    val name: String,
    val yearTerm: String
)