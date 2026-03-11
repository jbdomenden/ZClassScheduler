package zeroday.Controller.auth

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.principal
import io.ktor.server.auth.jwt.*
import io.ktor.server.response.*


data class JwtClaims(
    val userKey: String,
    val role: String,
    val email: String? = null,
)

fun ApplicationCall.jwtClaimsOrNull(): JwtClaims? {
    val p = principal<JWTPrincipal>() ?: return null
    val userKey = p.payload.getClaim("userId")?.asString()?.trim()
        ?: p.payload.subject?.trim()
        ?: return null
    val role = RoleCatalog.normalize(p.payload.getClaim("role")?.asString())
    val email = p.payload.getClaim("email")?.asString()?.trim()?.takeIf { it.isNotEmpty() }
    return JwtClaims(userKey = userKey, role = role, email = email)
}

suspend fun ApplicationCall.requireRole(allowed: Set<String>): JwtClaims? {
    val claims = jwtClaimsOrNull()
    if (claims == null) {
        respond(HttpStatusCode.Unauthorized, mapOf("success" to false, "message" to "Unauthorized", "code" to "UNAUTHORIZED"))
        return null
    }
    if (!RoleCatalog.satisfies(claims.role, allowed)) {
        respond(HttpStatusCode.Forbidden, mapOf("success" to false, "message" to "Forbidden", "code" to "FORBIDDEN"))
        return null
    }
    return claims
}
