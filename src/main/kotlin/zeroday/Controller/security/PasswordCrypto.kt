package zeroday.Controller.security

import org.bouncycastle.crypto.PBEParametersGenerator
import org.bouncycastle.crypto.generators.PKCS5S2ParametersGenerator
import org.bouncycastle.crypto.params.KeyParameter
import org.bouncycastle.jce.provider.BouncyCastleProvider
import java.security.Security
import java.security.SecureRandom
import java.util.Base64

object PasswordCrypto {

    init {
        // Ensure BC is registered exactly once
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(BouncyCastleProvider())
        }
    }

    private const val ITERATIONS = 120_000
    private const val KEY_LENGTH = 256 // bits
    private const val SALT_LENGTH = 16 // bytes

    /**
     * Generates a cryptographically secure random salt.
     * Stored as Base64 TEXT in the database.
     */
    fun generateSalt(): String {
        val saltBytes = ByteArray(SALT_LENGTH)
        SecureRandom().nextBytes(saltBytes)
        return Base64.getEncoder().encodeToString(saltBytes)
    }

    /**
     * Deterministically hashes a password using PBKDF2 (Bouncy Castle).
     * NEVER generates a new salt here.
     */
    fun hash(password: String, salt: String): String {
        val generator = PKCS5S2ParametersGenerator()

        generator.init(
            PBEParametersGenerator.PKCS5PasswordToUTF8Bytes(password.toCharArray()),
            Base64.getDecoder().decode(salt),
            ITERATIONS
        )

        val key = generator.generateDerivedParameters(KEY_LENGTH) as KeyParameter
        return Base64.getEncoder().encodeToString(key.key)
    }

    /**
     * Constant-time password verification.
     */
    fun verify(password: String, salt: String, expectedHash: String): Boolean {
        val computed = hash(password, salt)
        return constantTimeEquals(
            Base64.getDecoder().decode(computed),
            Base64.getDecoder().decode(expectedHash)
        )
    }

    private fun constantTimeEquals(a: ByteArray, b: ByteArray): Boolean {
        if (a.size != b.size) return false
        var result = 0
        for (i in a.indices) {
            result = result or (a[i].toInt() xor b[i].toInt())
        }
        return result == 0
    }
}
