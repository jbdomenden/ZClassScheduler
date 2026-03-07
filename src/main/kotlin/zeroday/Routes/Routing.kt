package zeroday.Routes

import zeroday.Controller.auth.authRoutes
import zeroday.Controller.auth.configureSecurity
import io.ktor.server.application.*
import io.ktor.server.http.content.staticResources
import io.ktor.server.response.*
import io.ktor.server.routing.*
import zeroday.Routes.Dashboard.conflictPromptRoutes
import zeroday.Routes.Dashboard.dashboardRoutes
import zeroday.Routes.Dashboard.roomUtilizationRoutes
import zeroday.Routes.Dashboard.teacherDashboardRoutes
import zeroday.Routes.Schedules.jhsSchedulerRoutes
import zeroday.Routes.Schedules.tertiarySchedulerRoutes
import zeroday.Routes.Schedules.nameiSchedulerRoutes
import zeroday.Routes.Schedules.shsSchedulerRoutes
import zeroday.Routes.Schedules.teacherBlockViewRoutes
import zeroday.Routes.Settings.courseManagementRoutes
import zeroday.Routes.Settings.roomManagementRoutes
import zeroday.Routes.Settings.teacherManagementRoutes
import zeroday.Routes.Settings.courseRoutes
import zeroday.Routes.Settings.curriculumManagementRoutes
import zeroday.Routes.Settings.curriculumRoutes
import zeroday.Routes.Settings.roomRoutes
import zeroday.Routes.Settings.subjectRoutes
import zeroday.Routes.Settings.teacherBlockRoutes
import zeroday.Routes.Settings.auditLogsRoutes
import zeroday.Routes.Settings.checkerLogsRoutes

fun Application.configureRouting() {
    // Ensure Authentication is installed before any route uses authenticate("auth-jwt").
    // (Also covers cases where Application.module wiring changes.)
    configureSecurity()

    routing {

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

        // ---------- STATIC FILES ----------
        staticResources(
            "/ZClassScheduler",
            "static/ZClassScheduler"
        )

        // Browsers often probe /favicon.ico even when pages declare a <link rel="icon">.
        // Keep this working without exposing the entire classpath static root.
        get("/favicon.ico") {
            call.respondRedirect("/ZClassScheduler/Assets/zclassscheduler.ico", permanent = true)
        }
        get("/zclassscheduler.ico") {
            call.respondRedirect("/ZClassScheduler/Assets/zclassscheduler.ico", permanent = true)
        }

        // ---------- REDIRECTS ----------
        get("/ZCS") { call.respondRedirect("/ZClassScheduler/html/Login.html") }
        get("/ZCSDash") { call.respondRedirect("/ZClassScheduler/html/Dashboard.html") }

        // ---------- HEALTH ----------
        get("/health") { call.respondText("OK") }

        log.info("All routes loaded successfully")
    }
}
