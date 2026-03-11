package zeroday.Controller.auth

object RoleCatalog {
    const val SUPER_ADMIN = "SUPER_ADMIN"
    const val ACADEMIC_HEAD = "ACADEMIC_HEAD"

    const val ADMIN = "ADMIN"
    const val PROGRAM_HEAD = "PROGRAM_HEAD"
    const val SCHEDULER = "SCHEDULER"
    const val ASSISTANT_PRINCIPAL = "ASSISTANT_PRINCIPAL"

    const val CHECKER = "CHECKER"
    const val STAFF = "STAFF"
    const val TEACHER = "TEACHER"

    val topLevel = setOf(SUPER_ADMIN, ACADEMIC_HEAD)
    val adminLike = setOf(ADMIN, PROGRAM_HEAD, SCHEDULER, ASSISTANT_PRINCIPAL)

    fun normalize(roleRaw: String?): String {
        val r = (roleRaw ?: "").trim().uppercase().replace("\\s+".toRegex(), "_").replace("-", "_")
        return when (r) {
            "" -> TEACHER
            "SUPERADMIN" -> SUPER_ADMIN
            "ACADEMICHEAD" -> ACADEMIC_HEAD
            "PROGRAMHEAD" -> PROGRAM_HEAD
            "ASSISTANTPRINCIPAL" -> ASSISTANT_PRINCIPAL
            "NON_TEACHING", "NONTEACHING" -> STAFF
            else -> r
        }
    }

    fun satisfies(roleRaw: String?, allowed: Set<String>): Boolean {
        val role = normalize(roleRaw)
        val allowedNorm = allowed.map { normalize(it) }.toSet()
        if (role in allowedNorm) return true

        if ((SUPER_ADMIN in allowedNorm || ACADEMIC_HEAD in allowedNorm) && role in topLevel) return true
        if (ADMIN in allowedNorm && role in adminLike) return true
        if (STAFF in allowedNorm && role == STAFF) return true
        return false
    }
}
