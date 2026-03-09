package zeroday.Models.dto.audit

import kotlinx.serialization.Serializable

@Serializable
data class AuditLogItem(
    val id: String,
    val userKey: String? = null,
    val userEmail: String? = null,
    val userName: String? = null,
    val role: String,
    val action: String,
    val entity: String,
    val entityId: String? = null,
    val success: Boolean,
    val message: String? = null,
    val httpMethod: String? = null,
    val path: String? = null,
    val timestamp: Long,
)

@Serializable
data class AuditLogListResponse(
    val items: List<AuditLogItem>,
    val limit: Int,
    val offset: Long,
    val nextOffset: Long? = null,
)
