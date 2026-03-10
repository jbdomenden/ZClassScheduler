package zeroday.Routes

import io.ktor.server.application.*
import io.ktor.server.http.content.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import zeroday.Controller.auth.authRoutes
import zeroday.Controller.auth.configureSecurity
import zeroday.Routes.Dashboard.conflictPromptRoutes
import zeroday.Routes.Dashboard.dashboardRoutes
import zeroday.Routes.Dashboard.roomUtilizationRoutes
import zeroday.Routes.Dashboard.teacherDashboardRoutes
import zeroday.Routes.Schedules.*
import zeroday.Routes.Settings.*

fun Application.configureRouting() {
    // Ensure Authentication is installed before any route uses authenticate("auth-jwt").
    // (Also covers cases where Application.module wiring changes.)
    configureSecurity()

    routing {

        get("/") { call.respondRedirect("/login") }
        get("/login") { call.respondRedirect("/ZClassScheduler/html/Login.html") }

        // ---------- STATIC FILES ----------
        static("/") {
            resources("static")
        }
        // ---------- AUTH ----------
        authRoutes()

        // ---------- API ----------
        courseRoutes()
        curriculumRoutes()
        subjectRoutes()
        dashboardRoutes()
        teacherDashboardRoutes()
        roomUtilizationRoutes()
        conflictPromptRoutes()
        roomRoutes()
        roomManagementRoutes()
        teacherManagementRoutes()
        teacherBlockRoutes()
        courseManagementRoutes()
        auditLogsRoutes()
        checkerLogsRoutes()
        teacherBlockViewRoutes()
        tertiarySchedulerRoutes()
        nameiSchedulerRoutes()
        shsSchedulerRoutes()
        jhsSchedulerRoutes()


        // Manage Curriculum (DB + PDF upload flow)
        curriculumManagementRoutes()



        // Browsers often probe /favicon.ico even when pages declare a <link rel="icon">.
        // Keep this working without exposing the entire classpath static root.
        get("/favicon.ico") { call.respondRedirect("/ZClassScheduler/Assets/zclassscheduler.ico", permanent = true) }
        get("/zclassscheduler.ico") { call.respondRedirect("/ZClassScheduler/Assets/zclassscheduler.ico", permanent = true) }

        // ---------- HEALTH ----------
        get("/health") { call.respondText("OK") }

        log.info("All routes loaded successfully")
    }
}
