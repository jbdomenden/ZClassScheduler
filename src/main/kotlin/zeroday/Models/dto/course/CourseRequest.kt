package zeroday.Models.dto.course

import zeroday.Models.db.tables.LevelType
import kotlinx.serialization.Serializable

@Serializable
data class CourseRequest(
    val code: String,
    val name: String,
    val levelType: LevelType,
    val department: String = ""
)
