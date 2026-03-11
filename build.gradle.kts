val kotlin_version: String by project
val ktor_version: String by project
val logback_version: String by project
val jetbrains_version: String by project

plugins {
    kotlin("jvm") version "2.3.0"
    kotlin("plugin.serialization") version "2.3.0"
    id("io.ktor.plugin") version "3.4.0"
    application
}

group = "zeroday"
version = "0.0.1"

repositories {
    mavenCentral()
}

application {
    mainClass = "io.ktor.server.netty.EngineMain"
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    // Ktor
    implementation("io.ktor:ktor-server-core-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-netty-jvm:${ktor_version}")
    implementation("io.ktor:ktor-server-core:${ktor_version}")
    implementation("io.ktor:ktor-server-config-yaml:${ktor_version}")
    implementation("io.ktor:ktor-server-content-negotiation:${ktor_version}")
    implementation("io.ktor:ktor-serialization-kotlinx-json:${ktor_version}")
    // Auth
    implementation("io.ktor:ktor-server-auth:${ktor_version}")
    implementation("io.ktor:ktor-server-auth-jwt:${ktor_version}")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json")

    // JWT
    implementation("com.auth0:java-jwt:4.4.0")
    // Database
    implementation("org.jetbrains.exposed:exposed-core:${jetbrains_version}")
    implementation("org.jetbrains.exposed:exposed-dao:${jetbrains_version}")
    implementation("org.jetbrains.exposed:exposed-jdbc:${jetbrains_version}")
    implementation("org.jetbrains.exposed:exposed-java-time:${jetbrains_version}")
    implementation("org.postgresql:postgresql:42.7.7")
    // Password hashing
    implementation("org.bouncycastle:bcprov-jdk18on:1.78.1")
    // Logging
    implementation("ch.qos.logback:logback-classic:${logback_version}")

    // Testing
    testImplementation("io.ktor:ktor-server-test-host:${ktor_version}")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:${kotlin_version}")
}
