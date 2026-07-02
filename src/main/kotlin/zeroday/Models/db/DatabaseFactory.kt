package zeroday.Models.db

import io.ktor.server.application.*
import io.ktor.server.config.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.DatabaseConfig
import org.jetbrains.exposed.sql.ExperimentalKeywordApi
import org.jetbrains.exposed.sql.SchemaUtils.createMissingTablesAndColumns
import org.jetbrains.exposed.sql.transactions.transaction
import zeroday.Models.db.tables.*
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

object DatabaseFactory {
    @OptIn(ExperimentalKeywordApi::class)
    fun init(environment: ApplicationEnvironment) {
        val settings = resolveConnectionSettings(environment.config)

        if (settings.user == null && settings.password == null) {
            Database.connect(
                url = settings.url,
                driver = settings.driver,
                databaseConfig = DatabaseConfig { preserveKeywordCasing = true }
            )
        } else {
            Database.connect(
                url = settings.url,
                driver = settings.driver,
                user = settings.user.orEmpty(),
                password = settings.password.orEmpty(),
                databaseConfig = DatabaseConfig { preserveKeywordCasing = true }
            )
        }

        transaction {
            createMissingTablesAndColumns(
                // ✅ AUTH USERS TABLE (used by RealAuth + SuperAdminBootstrap)
                UsersTable,

                // ✅ APP TABLES
                Courses,
                Curriculums,
                Subjects,
                Schedules,
                TeacherBlocks,
                Rooms,
                RoomBlocks,
                AuditLogs,
                CheckerLogs,
                ScheduleLogs,
                SchoolHoursSettings,
                SchoolDayRules,
                AcademicBreaks,
                Teachers
            )
        }
    }

    internal data class ConnectionSettings(
        val driver: String,
        val url: String,
        val user: String?,
        val password: String?
    )

    internal fun resolveConnectionSettings(
        config: ApplicationConfig,
        env: Map<String, String> = System.getenv()
    ): ConnectionSettings {
        val dbConfig = config.config("database")
        return resolveConnectionSettings(
            driver = dbConfig.require("driver"),
            configuredUrl = dbConfig.require("url"),
            configuredUser = dbConfig.optional("user"),
            configuredPassword = dbConfig.optional("password"),
            env = env
        )
    }

    internal fun resolveConnectionSettings(
        driver: String,
        configuredUrl: String,
        configuredUser: String?,
        configuredPassword: String?,
        env: Map<String, String> = System.getenv()
    ): ConnectionSettings {
        val rawUrl = env.nonBlank("DATABASE_URL")
            ?: env.nonBlank("JDBC_DATABASE_URL")
            ?: configuredUrl

        val parsedUrl = parseDatabaseUrl(rawUrl)
        val settings = ConnectionSettings(
            driver = driver,
            url = parsedUrl.jdbcUrl,
            user = parsedUrl.user ?: configuredUser,
            password = parsedUrl.password ?: configuredPassword
        )

        validateSupabaseSettings(settings)
        return settings
    }

    private data class ParsedDatabaseUrl(
        val jdbcUrl: String,
        val user: String?,
        val password: String?
    )

    private fun parseDatabaseUrl(rawUrl: String): ParsedDatabaseUrl {
        val trimmed = rawUrl.trim()
        if (trimmed.startsWith("jdbc:", ignoreCase = true)) {
            return ParsedDatabaseUrl(
                jdbcUrl = trimmed,
                user = null,
                password = null
            )
        }

        if (
            trimmed.startsWith("postgres://", ignoreCase = true) ||
            trimmed.startsWith("postgresql://", ignoreCase = true)
        ) {
            val uri = URI(trimmed)
            val scheme = "jdbc:postgresql"
            val host = uri.host ?: error("Database URL is missing a host: $trimmed")
            val port = if (uri.port == -1) "" else ":${uri.port}"
            val path = uri.rawPath?.takeIf { it.isNotBlank() } ?: error("Database URL is missing a database name: $trimmed")
            val query = uri.rawQuery?.let { "?$it" }.orEmpty()
            val userInfo = uri.rawUserInfo
            val user = userInfo?.substringBefore(':')?.decodeUrlPart()
            val password = userInfo
                ?.substringAfter(':', missingDelimiterValue = "")
                ?.takeIf { userInfo.contains(':') }
                ?.decodeUrlPart()

            return ParsedDatabaseUrl(
                jdbcUrl = "$scheme://$host$port$path$query",
                user = user,
                password = password
            )
        }

        error("Unsupported database URL format. Use a JDBC URL or a postgres:// URI.")
    }

    private fun validateSupabaseSettings(settings: ConnectionSettings) {
        val host = extractHost(settings.url)?.lowercase() ?: return
        val user = settings.user ?: return

        if (host.endsWith(".pooler.supabase.com") && !user.contains('.')) {
            error("Supabase pooler connections require DB_USER in the form postgres.<project-ref>.")
        }

        if (host.startsWith("db.") && host.endsWith(".supabase.co") && user.contains('.')) {
            error(
                "Supabase direct connections use DB_USER=postgres. " +
                    "If your username is postgres.<project-ref>, switch the host to the Supabase pooler."
            )
        }
    }

    private fun extractHost(jdbcUrl: String): String? =
        runCatching {
            URI(jdbcUrl.removePrefix("jdbc:")).host
        }.getOrNull()

    private fun String.decodeUrlPart(): String =
        URLDecoder.decode(this, StandardCharsets.UTF_8)

    private fun ApplicationConfig.require(path: String): String =
        property(path).getString().trim()

    private fun ApplicationConfig.optional(path: String): String? =
        propertyOrNull(path)?.getString()?.trim()?.takeIf { it.isNotBlank() }

    private fun Map<String, String>.nonBlank(key: String): String? =
        this[key]?.trim()?.takeIf { it.isNotBlank() }
}
