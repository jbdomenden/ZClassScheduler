package zeroday.Controller.auth

import com.auth0.jwt.JWT
import com.auth0.jwt.algorithms.Algorithm
import java.util.*
import java.time.Instant
//
//class JwtService(
//    secret: String = "CHANGE_ME_SUPER_SECRET"
//) {
//
//    private val algorithm = Algorithm.HMAC256(secret)
//
//    fun generateToken(
//        userId: UUID,
//        role: String
//    ): String {
//
//        return JWT.create()
//            .withSubject(userId.toString())
//            .withClaim("role", role)
//            .withIssuedAt(Date.from(Instant.now()))
//            .withExpiresAt(Date.from(Instant.now().plusSeconds(60 * 60 * 8))) // 8h
//            .sign(algorithm)
//    }
//}
