package zeroday.Controller.audit

import io.ktor.server.application.*
import io.ktor.server.auth.principal
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.httpMethod
import io.ktor.server.request.path
import zeroday.Queries.Login.AuditLogRepository
import java.util.UUID

data class JwtActor(
    val userKey: String,
    val role: String,
    val email: String? = null,
)

private fun String?.normRole(): String =
    (this ?: "").trim().uppercase()

fun ApplicationCall.jwtActorOrNull(): JwtActor? {
    val p = principal<JWTPrincipal>() ?: return null
    val userKey = p.payload.getClaim("userId")?.asString()?.trim()
        ?: p.payload.subject?.trim()
        ?: return null
    val role = p.payload.getClaim("role")?.asString()?.normRole()
        ?: return null
    val email = p.payload.getClaim("email")?.asString()?.trim()?.takeIf { it.isNotEmpty() }
    return JwtActor(userKey = userKey, role = role, email = email)
}

fun JwtActor.isPrivileged(): Boolean =
    role == "ADMIN" || role == "SUPER_ADMIN"

fun ApplicationCall.auditPrivilegedCrud(
    action: String,
    entity: String,
    entityId: UUID? = null,
    success: Boolean,
    message: String? = null,
) {
    val actor = jwtActorOrNull() ?: return
    if (!actor.isPrivileged()) return

    AuditLogRepository.log(
        userKey = actor.userKey,
        role = actor.role,
        userEmail = actor.email,
        action = action,
        entity = entity,
        entityId = entityId,
        success = success,
        message = message,
        httpMethod = request.httpMethod.value,
        path = request.path(),
    )
}
