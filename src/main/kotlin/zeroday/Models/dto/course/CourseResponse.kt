package zeroday.Models.dto.course

import zeroday.Models.db.tables.LevelType
import kotlinx.serialization.Serializable

@Serializable
data class CourseResponse(
    val id: String,
    val code: String,
    val name: String,
    val levelType: LevelType,
    val department: String,
    val active: Boolean
)