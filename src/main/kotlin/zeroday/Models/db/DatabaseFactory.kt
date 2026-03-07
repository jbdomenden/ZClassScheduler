package zeroday.Models.db

import zeroday.Models.db.tables.*
import io.ktor.server.application.*
import org.jetbrains.exposed.sql.Database
import org.jetbrains.exposed.sql.DatabaseConfig
import org.jetbrains.exposed.sql.ExperimentalKeywordApi
import org.jetbrains.exposed.sql.SchemaUtils.createMissingTablesAndColumns
import org.jetbrains.exposed.sql.transactions.transaction

object DatabaseFactory {
    @OptIn(ExperimentalKeywordApi::class)
    fun init(environment: ApplicationEnvironment) {

        val dbConfig = environment.config.config("database")

        Database.connect(
            url = dbConfig.property("url").getString(),
            driver = dbConfig.property("driver").getString(),
            user = dbConfig.property("user").getString(),
            password = dbConfig.property("password").getString(),
            databaseConfig = DatabaseConfig { preserveKeywordCasing = true }
        )

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
                Teachers
            )
        }
    }
}
