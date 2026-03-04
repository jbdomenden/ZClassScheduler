package zeroday.Routes.Dashboard

import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.response.*
import io.ktor.server.auth.*
import zeroday.Controller.service.TeacherDashboardService



fun Application.teacherDashboardRoutes() {


    routing {
        authenticate("auth-jwt") {
            log.info("✅ TeacherDashboardRoutes LOADED")

            route("/dashboard/teachers") {

                get("/today") {
                    call.respond(

                        TeacherDashboardService.teachersToday()
                    )
                }

                get("/now") {
                    call.respond(
                        TeacherDashboardService.teachersNow()
                    )
                }

                get("/test") {
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

