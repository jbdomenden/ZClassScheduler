package zeroday.Controller.auth

import zeroday.Controller.auth.JwtConfig.secret
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

    private val algorithm = Algorithm.HMAC256(secret)

    fun generateToken(
        userId: String,
        role: String
    ): String {

        return JWT.create()
            .withSubject(userId)
            .withClaim("role", role)
            .withIssuedAt(Date.from(Instant.now()))
            .withExpiresAt(Date.from(Instant.now().plusSeconds(60 * 60 * 8))) // 8h
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
            role = user.role
        )

        return AuthResult(
            token = token,
            role = user.role
        )

    }

}
