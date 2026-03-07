package zeroday.Controller.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import zeroday.Queries.Login.UserRepository
import zeroday.Controller.security.PasswordCrypto
import java.time.Instant
import java.util.*


data class AuthResult(
    val token: String,
    val role: String
)
object JwtService{

    private val algorithm = Algorithm.HMAC256(JwtConfig.secret)

    fun generateToken(
        userId: String,
        role: String,
        email: String
    ): String {

        return JWT.create()
            .withIssuer(JwtConfig.issuer)
            .withAudience(JwtConfig.audience)
            .withSubject(userId)
            .withClaim("userId", userId)
            .withClaim("role", role)
            .withClaim("email", email)
            .withIssuedAt(Date.from(Instant.now()))
            .withExpiresAt(Date.from(Instant.now().plusMillis(JwtConfig.validityMs)))
            .sign(algorithm)
    }
}
class RealAuth(
    private val userRepository: UserRepository,
    private val jwtService: JwtService
) {

    fun login(email: String, password: String): AuthResult? {

        val user = userRepository.findByEmail(email)
            ?: return null

        // ✅ Constant-time password verification
        if (!PasswordCrypto.verify(
                password = password,
                salt = user.passwordSalt.toString(),
                expectedHash = user.passwordHash
            )
        ) {
            return null
        }

        // ✅ Use Long directly (simpler, safer)
        val token = jwtService.generateToken(
            userId = user.id.toString(),
            role = user.role,
            email = user.email
        )

        return AuthResult(
            token = token,
            role = user.role
        )

    }

}
