package zeroday.Controller.service

enum class ConflictPriority(val level: Int) {
    HIGH(3),
    MEDIUM(2),
    LOW(1),
    INFO(0)
}
