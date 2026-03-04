package zeroday.Models.dto.teacher

import kotlinx.serialization.Serializable

@Serializable
data class TeacherResponse(
    val id: String,
    val empId: String,
    val firstName: String,
    val lastName: String,
    val department: String,
    val email: String,
    val role: String,
    val status: String
)
