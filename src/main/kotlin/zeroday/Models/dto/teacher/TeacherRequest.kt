package zeroday.Models.dto.teacher

import kotlinx.serialization.Serializable

@Serializable
data class TeacherRequest(
    val empId: String? = null,
    val firstName: String,
    val lastName: String,
    val department: String,
    val email: String,
    val password: String,
    val role: String,
    /** "Active" | "Inactive" (optional; defaults to Active) */
    val status: String? = null
)
