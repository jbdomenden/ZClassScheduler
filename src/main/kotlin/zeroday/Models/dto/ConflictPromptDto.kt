package zeroday.Models.dto

import kotlinx.serialization.Serializable

@Serializable
data class ConflictPromptDto(
    val priority: String,
    val message: String,
    val timestamp: String
)
