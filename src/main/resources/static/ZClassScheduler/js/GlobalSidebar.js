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
    const token = (localStorage.getItem("token") || "").trim();

    // Preferred: resolve role from JWT (/api/auth/me) so SUPER_ADMIN can be recognized even if not in Teachers list.
    if (token) {
        try {
            const res = await fetch("/api/auth/me", {
                headers: {
                    "Accept": "application/json",
                    "Authorization": `Bearer ${token}`,
                }
            });
            if (res.ok) {
                const me = await res.json();
                const role = normalizeRole(me?.role || "");
                if (role) {
                    localStorage.setItem("role", role);
                    return;
                }
            }
        } catch (_) {
            // fall through
        }
    }

    // If we don't know who the user is, keep safest default (non-privileged)
    if (!currentEmail) {
        if (!localStorage.getItem("role")) localStorage.setItem("role", "TEACHER");
        return;
    }

    // If role already resolved to admin/super_admin, keep it (avoid extra calls)
    const existingRole = normalizeRole(localStorage.getItem("role"));
    if (existingRole === "ADMIN" || existingRole === "SUPER_ADMIN") return;

    try {
        const res = await fetch("/api/settings/teachers", {
            headers: {
                "Accept": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {}),
            }
        });
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
function applySidebarState() {
    const sidebar = document.querySelector(".sidebar");
    const container = document.querySelector(".container");
    if (!sidebar) return;

    const isMobile = () => window.matchMedia("(max-width: 900px)").matches;

    function ensureBackdrop() {
        let el = document.getElementById("sidebarBackdrop");
        if (el) return el;
        el = document.createElement("div");
        el.id = "sidebarBackdrop";
        el.className = "sidebar-backdrop";
        document.body.appendChild(el);
        return el;
    }

    function syncMobileOverlay(open) {
        if (!isMobile()) return;
        document.body.classList.toggle("sidebar-open", open);
        ensureBackdrop().classList.toggle("show", open);
    }

    try {
        const saved = localStorage.getItem("sidebarCollapsed");
        // On mobile, always start collapsed to avoid covering the page on load.
        const collapsed = isMobile() ? true : (saved === "1");
        sidebar.classList.toggle("collapsed", collapsed);
        if (container) container.classList.toggle("sidebar-collapsed", collapsed);
        if (isMobile()) ensureBackdrop(); // keep it ready for toggle/backdrop clicks
        syncMobileOverlay(!collapsed);
    } catch (_) {
        // ignore
    }
}

function toggleSidebar() {
    const sidebar = document.querySelector(".sidebar");
    const container = document.querySelector(".container");
    if (!sidebar) return;

    const collapsed = sidebar.classList.toggle("collapsed");
    if (container) container.classList.toggle("sidebar-collapsed", collapsed);

    const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
    if (isMobile()) {
        let backdrop = document.getElementById("sidebarBackdrop");
        if (!backdrop) {
            backdrop = document.createElement("div");
            backdrop.id = "sidebarBackdrop";
            backdrop.className = "sidebar-backdrop";
            document.body.appendChild(backdrop);
        }
        document.body.classList.toggle("sidebar-open", !collapsed);
        backdrop.classList.toggle("show", !collapsed);
    }

    try {
        localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
    } catch (_) {
        // ignore
    }
}

function setupSidebarToggle() {
    applySidebarState();

    // Event delegation so this still works when header/sidebar are injected after DOMContentLoaded.
    if (window.__zcsDelegatedNav === true) return;
    window.__zcsDelegatedNav = true;

    function setUserMenuOpen(open) {
        const dd = document.getElementById("userMenuDropdown");
        const btn = document.getElementById("userMenuBtn");
        if (!dd || !btn) return;
        dd.classList.toggle("hidden", !open);
        btn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function isUserMenuOpen() {
        const dd = document.getElementById("userMenuDropdown");
        return !!dd && !dd.classList.contains("hidden");
    }

    // Keep overlay state sane across rotations/resizes (mobile <-> desktop).
    let wasMobile = window.matchMedia("(max-width: 900px)").matches;
    window.addEventListener("resize", () => {
        const isMobile = window.matchMedia("(max-width: 900px)").matches;
        if (isMobile === wasMobile) return;

        const sidebar = document.querySelector(".sidebar");
        const container = document.querySelector(".container");
        const bd = document.getElementById("sidebarBackdrop");

        if (!isMobile) {
            document.body.classList.remove("sidebar-open");
            if (bd) bd.classList.remove("show");
        } else {
            // Entering mobile: collapse drawer by default.
            if (sidebar) sidebar.classList.add("collapsed");
            if (container) container.classList.add("sidebar-collapsed");
            document.body.classList.remove("sidebar-open");
            if (bd) bd.classList.remove("show");
        }

        wasMobile = isMobile;
    });

    document.addEventListener("click", (e) => {
        // Mobile: clicking the backdrop closes the sidebar.
        const bd = e.target.closest("#sidebarBackdrop");
        if (bd) {
            e.preventDefault();
            const sidebar = document.querySelector(".sidebar");
            const container = document.querySelector(".container");
            if (sidebar && !sidebar.classList.contains("collapsed")) {
                sidebar.classList.add("collapsed");
                if (container) container.classList.add("sidebar-collapsed");
                document.body.classList.remove("sidebar-open");
                bd.classList.remove("show");
            }
            return;
        }

        const t = e.target.closest("#sidebarToggle, .hamburger");
        if (t) {
            e.preventDefault();
            toggleSidebar();
            return;
        }

        const umb = e.target.closest("#userMenuBtn");
        if (umb) {
            e.preventDefault();
            setUserMenuOpen(!isUserMenuOpen());
            return;
        }

        const hb = e.target.closest("#helpBtn");
        if (hb) {
            e.preventDefault();
            setUserMenuOpen(false);
            if (typeof window.showHelpTutorial === "function") window.showHelpTutorial();
            else window.appAlert?.("Help is not available on this page yet.");
            return;
        }

        const cpb = e.target.closest("#changePasswordBtn");
        if (cpb) {
            e.preventDefault();
            setUserMenuOpen(false);
            if (typeof window.showChangePasswordModal === "function") window.showChangePasswordModal();
            else window.appAlert?.("Change password is not available right now.");
            return;
        }

        const lb = e.target.closest("#logoutBtn");
        if (lb) {
            e.preventDefault();
            setUserMenuOpen(false);
            logout();
            return;
        }

        // Click outside closes the user menu.
        if (isUserMenuOpen()) {
            const inside = e.target.closest("#userMenu");
            if (!inside) setUserMenuOpen(false);
        }

        // Mobile: tapping a nav link closes the sidebar so content is visible.
        const navLink = e.target.closest(".sidebar a");
        if (navLink) {
            const isMobile = () => window.matchMedia("(max-width: 900px)").matches;
            if (isMobile()) {
                const sidebar = document.querySelector(".sidebar");
                const container = document.querySelector(".container");
                const bd2 = document.getElementById("sidebarBackdrop");
                if (sidebar) sidebar.classList.add("collapsed");
                if (container) container.classList.add("sidebar-collapsed");
                document.body.classList.remove("sidebar-open");
                if (bd2) bd2.classList.remove("show");
            }
        }
    });

    // Mobile: ESC closes drawer (useful for desktop too when it is collapsed/expanded).
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;

        if (isUserMenuOpen()) setUserMenuOpen(false);

        const sidebar = document.querySelector(".sidebar");
        const container = document.querySelector(".container");
        const bd = document.getElementById("sidebarBackdrop");
        if (sidebar && !sidebar.classList.contains("collapsed")) {
            sidebar.classList.add("collapsed");
            if (container) container.classList.add("sidebar-collapsed");
            document.body.classList.remove("sidebar-open");
            if (bd) bd.classList.remove("show");
        }
    });
}

// Support any legacy inline handlers that call toggleSidebar().
window.toggleSidebar = toggleSidebar;
window.applySidebarState = applySidebarState;

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
        window.location.href = "/ZClassScheduler/html/Login.html";
    } catch (err) {
        // Failsafe: still clear & redirect
        localStorage.removeItem("role");
        localStorage.removeItem("currentUserEmail");
        localStorage.removeItem("token");
        sessionStorage.clear();
        window.location.href = "/ZClassScheduler/html/Login.html";
    }
}

