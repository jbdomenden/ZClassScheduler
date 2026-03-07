package zeroday.Controller.auth

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable
import zeroday.Controller.security.PasswordCrypto
import zeroday.Queries.Login.UserRepositoryImpl
import zeroday.Queries.Settings.TeacherRepository

// ---------- CONFIG ----------

object JwtConfig {
    const val issuer = "zeroday"
    const val audience = "zeroday-users"
    const val realm = "ZeroDaySchedulingSystem"
    const val secret = "CHANGE_THIS_SECRET"
    const val validityMs = 1000L * 60 * 60 * 24 // 24 hours
}

// ---------- MODELS ----------

@Serializable
data class LoginPayload(
    val email: String,
    val password: String,
    val rememberMe: Boolean = false,
)

@Serializable
data class LoginWrapper(
    val payload: LoginPayload
)
@Serializable
data class LoginResponse(
    val token: String,
    val forcePasswordChange: Boolean
)

@Serializable
data class ChangePasswordRequest(
    val oldPassword: String,
    val newPassword: String,
)

//@Serializable
//data class UserPrincipal(
//    val userId: UUID,
//    val role: String
//)



// ---------- ROUTES ----------

fun Route.authRoutes() {

        route("/api/auth") {

            post("/login") {
                try {
                    val req = call.receive<LoginWrapper>()
                    val email = req.payload.email.trim().lowercase()
                    val password = req.payload.password

                    val userRepo = UserRepositoryImpl()
                    val user = userRepo.findByEmail(email)
                    if (user == null) {
                        call.respond(
                            HttpStatusCode.Unauthorized,
                            mapOf("message" to "Invalid credentials")
                        )
                        return@post
                    }

                    if (!PasswordCrypto.verify(
                            password = password,
                            salt = user.passwordSalt,
                            expectedHash = user.passwordHash
                        )
                    ) {
                        call.respond(
                            HttpStatusCode.Unauthorized,
                            mapOf("message" to "Invalid credentials")
                        )
                        return@post
                    }

                    val token = JwtService.generateToken(
                        userId = user.id.toString(),
                        role = user.role,
                        email = user.email
                    )

                    fun normalizeRole(roleRaw: String?): String {
                        val r0 = (roleRaw ?: "").trim().uppercase().replace("\\s+".toRegex(), "_").replace("-", "_")
                        return when (r0) {
                            "SUPERADMIN" -> "SUPER_ADMIN"
                            "" -> "TEACHER"
                            else -> r0
                        }
                    }

                    fun defaultPassword(firstName: String, lastName: String): String {
                        val fi = firstName.trim().firstOrNull()?.lowercaseChar()?.toString() ?: ""
                        val ln = lastName.trim().lowercase().replace("\\s+".toRegex(), "")
                        val p = (fi + ln).trim()
                        return if (p.isNotEmpty()) p else "password"
                    }

                    val roleNorm = normalizeRole(user.role)
                    val forcePasswordChange = when (roleNorm) {
                        "SUPER_ADMIN" -> PasswordCrypto.verify("admin123", user.passwordSalt, user.passwordHash)
                        "ADMIN", "CHECKER" -> {
                            val t = TeacherRepository.findIdentityByEmail(email)
                            if (t == null) false
                            else PasswordCrypto.verify(
                                defaultPassword(t.firstName, t.lastName),
                                user.passwordSalt,
                                user.passwordHash
                            )
                        }
                        else -> false
                    }

                    call.respond(
                        HttpStatusCode.OK,
                        LoginResponse(
                            token = token,
                            forcePasswordChange = forcePasswordChange
                        )
                    )

                } catch (e: Exception) {
                    application.log.error("LOGIN FAILED", e)
                    call.respond(HttpStatusCode.InternalServerError, mapOf("message" to "Login failed"))
                }
            }

            // Stateless JWT logout; the client clears local token/state.
            post("/logout") {
                call.respond(HttpStatusCode.NoContent)
            }

            authenticate("auth-jwt") {
                get("/me") {
                    val p = call.principal<JWTPrincipal>()
                    val userId = p?.payload?.getClaim("userId")?.asString()
                        ?: p?.payload?.subject
                    val role = p?.payload?.getClaim("role")?.asString()
                    val email = p?.payload?.getClaim("email")?.asString()

                    if (userId.isNullOrBlank() || role.isNullOrBlank()) {
                        call.respond(HttpStatusCode.Unauthorized, mapOf("message" to "Unauthorized"))
                        return@get
                    }

                    call.respond(mapOf("userId" to userId, "role" to role, "email" to (email ?: "")))
                }

                post("/change-password") {
                    val p = call.principal<JWTPrincipal>()
                    val email = p?.payload?.getClaim("email")?.asString()?.trim()?.lowercase()

                    if (email.isNullOrBlank()) {
                        call.respond(HttpStatusCode.Unauthorized, mapOf("message" to "Unauthorized"))
                        return@post
                    }

                    val req = try {
                        call.receive<ChangePasswordRequest>()
                    } catch (_: Exception) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid request"))
                        return@post
                    }

                    val oldPassword = req.oldPassword
                    val newPassword = req.newPassword

                    if (newPassword.isBlank() || newPassword.length < 6) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "New password must be at least 6 characters"))
                        return@post
                    }

                    val userRepo = UserRepositoryImpl()
                    val user = userRepo.findByEmail(email)
                    if (user == null) {
                        call.respond(HttpStatusCode.NotFound, mapOf("message" to "User not found"))
                        return@post
                    }

                    if (!PasswordCrypto.verify(oldPassword, user.passwordSalt, user.passwordHash)) {
                        call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Current password is incorrect"))
                        return@post
                    }

                    val salt = PasswordCrypto.generateSalt()
                    val hash = PasswordCrypto.hash(newPassword, salt)

                    val updated = userRepo.updatePasswordByEmail(email, salt, hash)
                    if (!updated) {
                        call.respond(HttpStatusCode.InternalServerError, mapOf("message" to "Unable to update password"))
                        return@post
                    }

                    // Keep teachers table in sync when present (legacy storage of plain password).
                    TeacherRepository.updatePasswordByEmail(email, newPassword)

                    call.respond(HttpStatusCode.OK, mapOf("message" to "Password updated"))
                }
            }

        }
    }


// ---------- SECURITY INSTALL ----------

fun Application.configureSecurity() {
    // Defensive: if routing gets initialized before this is called (or module wiring changes),
    // Ktor will throw MissingApplicationPluginException when authenticate("auth-jwt") is used.
    if (pluginOrNull(Authentication) != null) return

    install(Authentication) {
        jwt("auth-jwt") {
            realm = JwtConfig.realm
            verifier(
                com.auth0.jwt.JWT.require(
                    com.auth0.jwt.algorithms.Algorithm.HMAC256(JwtConfig.secret)
                )
                    .withIssuer(JwtConfig.issuer)
                    .withAudience(JwtConfig.audience)
                    .build()
            )
            validate { credential ->
                val userId = credential.payload.getClaim("userId").asString()
                val role = credential.payload.getClaim("role").asString()
                if (userId != null && role != null) {
                    JWTPrincipal(credential.payload)
                } else null
            }
        }
    }
}
