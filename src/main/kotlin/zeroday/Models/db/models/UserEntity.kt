package zeroday.Models.db.models

data class UserEntity(
    val id: Long,
    val email: String,
    val passwordHash: String,
    val passwordSalt: String,
    val role: String
)
