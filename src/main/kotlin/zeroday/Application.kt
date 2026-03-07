package zeroday

import io.ktor.server.application.*
import io.ktor.server.netty.EngineMain
import zeroday.Models.db.DatabaseFactory
import zeroday.Models.db.bootstrap.SuperAdminBootstrap
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.plugins.contentnegotiation.*
import zeroday.Queries.Login.UserRepositoryImpl
import zeroday.Controller.auth.configureSecurity
import zeroday.Routes.configureRouting

fun main(args: Array<String>) {
    EngineMain.main(args)
}

fun Application.module() {
    DatabaseFactory.init(environment)

    val userRepository = UserRepositoryImpl()
    SuperAdminBootstrap.init(userRepository)

    install(ContentNegotiation) { json() }

    // Must be installed before any routes use authenticate("auth-jwt")
    configureSecurity()

    configureRouting()
}
