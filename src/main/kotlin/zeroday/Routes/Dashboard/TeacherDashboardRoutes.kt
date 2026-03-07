package zeroday.Routes.Dashboard

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import zeroday.Controller.auth.requireRole
import zeroday.Controller.service.TeacherDashboardService



fun Application.teacherDashboardRoutes() {


    routing {
        authenticate("auth-jwt") {
            log.info("TeacherDashboardRoutes LOADED")

            route("/dashboard/teachers") {

                get("/today") {
                    call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                    call.respond(

                        TeacherDashboardService.teachersToday()
                    )
                }

                get("/now") {
                    call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                    call.respond(
                        TeacherDashboardService.teachersNow()
                    )
                }

                get("/test") {
                    call.requireRole(setOf("ADMIN", "SUPER_ADMIN")) ?: return@get
                    call.respond(
                        mapOf(
                            "status" to "ok",
                            "message" to "Teacher dashboard today works"
                        )
                    )
                }

            }


        }

    }
}

