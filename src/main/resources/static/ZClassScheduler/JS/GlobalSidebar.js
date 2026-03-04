async function loadLayout() {
    const html = await res.text();
    document.body.insertAdjacentHTML("afterbegin", html);

    // Ensure role is derived from Manage Teachers + current user before filtering nav
    await resolveAndStoreCurrentUserRole();
    applyRoleControl();
    setActiveLink();
    setupSidebarToggle();
}

// When nav.html is injected via load-global.js, this script is executed but loadLayout()
// is not used. So we run the same setup directly.
document.addEventListener("DOMContentLoaded", async () => {
    try {
        await resolveAndStoreCurrentUserRole();
    } catch (_) {
        // ignore
    }

    applyRoleControl();
    setActiveLink();
    setupSidebarToggle();

    // Hook logout button if present in header.html
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", logout);
});

/* ==========================
   ROLE RESOLUTION
   - Role MUST be based on Manage Teachers (teacher.role) and current user
   - Current user is identified by email stored during login
========================== */
async function resolveAndStoreCurrentUserRole() {
    const normalizeRole = (r) => String(r || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");

    const currentEmail = (localStorage.getItem("currentUserEmail") || "").trim().toLowerCase();

    // If we don't know who the user is, keep safest default (non-privileged)
    if (!currentEmail) {
        if (!localStorage.getItem("role")) localStorage.setItem("role", "TEACHER");
        return;
    }

    // If role already resolved to admin/super_admin, keep it (avoid extra calls)
    const existingRole = normalizeRole(localStorage.getItem("role"));
    if (existingRole === "ADMIN" || existingRole === "SUPER_ADMIN") return;

    try {
        const res = await fetch("/api/settings/teachers", { headers: { "Accept": "application/json" } });
        if (!res.ok) return;

        const teachers = await res.json();
        if (!Array.isArray(teachers)) return;

        const me = teachers.find(t => String(t?.email || "").trim().toLowerCase() === currentEmail);
        const role = normalizeRole(me?.role || "TEACHER");

        // Store normalized role for consistent [data-role] matching
        localStorage.setItem("role", role || "TEACHER");
    } catch {
        // keep default
        if (!localStorage.getItem("role")) localStorage.setItem("role", "TEACHER");
    }
}

/* ==========================
   ROLE CONTROL
========================== */
function applyRoleControl() {
    // Role is stored client-side. If missing, default to a non-privileged role
    // so Settings does NOT appear for unauthenticated/unknown users.
    const rawRole = (localStorage.getItem("role") || "TEACHER").trim();

    const normalizeRole = (r) => String(r || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");

    const CURRENT_USER_ROLE = normalizeRole(rawRole);

    document.querySelectorAll("[data-role]").forEach(el => {
        const roles = (el.dataset.role || "")
            .split(",")
            .map(normalizeRole)
            .filter(Boolean);

        if (!roles.includes(CURRENT_USER_ROLE)) el.remove();
    });
}

/* ==========================
   ACTIVE LINK
========================== */
function setActiveLink() {
    const current = window.location.pathname.split("/").pop();

    document.querySelectorAll(".sidebar a").forEach(link => {
        const href = link.getAttribute("href");
        if (href === current) {
            link.classList.add("active");

            // auto open parent <details>
            const details = link.closest("details");
            if (details) details.open = true;
        }
    });
}

/* ==========================
   SIDEBAR TOGGLE
========================== */
function setupSidebarToggle() {
    const toggleBtn = document.getElementById("sidebarToggle");
    const sidebar = document.querySelector(".sidebar");
    const container = document.querySelector(".container");

    if (!toggleBtn) return;

    toggleBtn.addEventListener("click", () => {
        sidebar.classList.toggle("collapsed");
        container.classList.toggle("sidebar-collapsed");
    });
}

async function logout() {
    try {
        // Optional: disable button to prevent double clicks
        const btn = document.getElementById("logoutBtn");
        if (btn) btn.disabled = true;

        const res = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include",          // IMPORTANT for cookie-based sessions
            headers: {
                "Content-Type": "application/json",
                // "X-CSRF-Token": getCsrfToken(), // enable if you use CSRF tokens
            },
            body: JSON.stringify({ reason: "user_clicked_logout" }),
        });

        // Even if server returns 204/200, we should clear client state
        localStorage.removeItem("role");
        localStorage.removeItem("currentUserEmail");
        localStorage.removeItem("token");     // if you store tokens (ideally you don't)
        sessionStorage.clear();

        // If server rejected, still redirect (prevents stuck UI)
        window.location.href = "login.html";
    } catch (err) {
        // Failsafe: still clear & redirect
        localStorage.removeItem("role");
        localStorage.removeItem("currentUserEmail");
        localStorage.removeItem("token");
        sessionStorage.clear();
        window.location.href = "login.html";
    }
}

