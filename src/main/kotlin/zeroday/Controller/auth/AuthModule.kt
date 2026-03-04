package zeroday.Controller.auth

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.auth.*
import io.ktor.server.auth.jwt.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

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
                    val email = req.payload.email
                    val password = req.payload.password

                    application.log.info("LOGIN ATTEMPT: ${email} ${password}")

                    call.respond(HttpStatusCode.OK)

                } catch (e: Exception) {
                    application.log.error("LOGIN FAILED", e)
                    call.respond(HttpStatusCode.InternalServerError, "Login failed")
                }
            }

        }
    }


// ---------- SECURITY INSTALL ----------

fun Application.configureSecurity() {
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
