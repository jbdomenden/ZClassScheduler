package zeroday.Controller.service

import java.time.LocalTime

object SchoolHoursService {

    fun start(): LocalTime = LocalTime.of(7, 0)
    fun end(): LocalTime = LocalTime.of(21, 0)

    fun totalMinutes(): Long =
        java.time.Duration.between(start(), end()).toMinutes()
}
