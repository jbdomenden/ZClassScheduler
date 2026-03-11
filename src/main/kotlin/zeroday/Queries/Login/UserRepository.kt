package zeroday.Queries.Login

import zeroday.Models.db.models.UserEntity

interface UserRepository {
    fun findByEmail(email: String): UserEntity?
    fun insert(user: UserEntity)
    fun updateRoleByEmail(email: String, role: String): Boolean
}
