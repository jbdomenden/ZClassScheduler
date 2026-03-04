(async function () {
    // =========================
    // PAGE SPLASH / BUFFER (GLOBAL)
    // =========================
    const SPLASH_ID = "pageSplashOverlay";

    function injectSplash() {
        if (document.getElementById(SPLASH_ID)) return;

        const style = document.createElement("style");
        style.id = "pageSplashStyle";
        style.textContent = `
#${SPLASH_ID}{
    position:fixed; inset:0;
    display:flex; align-items:center; justify-content:center;
    background:rgba(255,255,255,.86);
    backdrop-filter: blur(4px);
    z-index:99999;
    opacity:0; pointer-events:none;
    transition: opacity .18s ease;
}
#${SPLASH_ID}.show{ opacity:1; pointer-events:auto; }
#${SPLASH_ID} .splash-card{
    display:flex; flex-direction:column; align-items:center; gap:10px;
    padding:18px 22px;
    border-radius:14px;
    background:#fff;
    box-shadow:0 10px 30px rgba(0,0,0,.12);
    min-width:200px;
}
#${SPLASH_ID} .spinner{
    width:34px; height:34px;
    border-radius:50%;
    border:4px solid rgba(0,0,0,.12);
    border-top-color: rgba(0,0,0,.55);
    animation: spin .8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
#${SPLASH_ID} .txt{
    font-size:13px;
    opacity:.8;
    letter-spacing:.2px;
}
`;
        document.head.appendChild(style);

        const overlay = document.createElement("div");
        overlay.id = SPLASH_ID;
        overlay.innerHTML = `
<div class="splash-card" role="status" aria-live="polite">
    <div class="spinner"></div>
<div class="txt">Loading…</div>
</div>
`;
        document.body.appendChild(overlay);
    }

    function showSplash() {
        const el = document.getElementById(SPLASH_ID);
        if (!el) return;
        el.classList.add("show");
    }

    function hideSplash() {
        const el = document.getElementById(SPLASH_ID);
        if (!el) return;
        el.classList.remove("show");
    }

    function isInternalNavigableLink(a) {
        if (!a) return false;
        const href = a.getAttribute("href");
        if (!href) return false;
        if (a.getAttribute("target") === "_blank") return false;
        if (a.hasAttribute("download")) return false;

        // Ignore in-page anchors
        if (href.startsWith("#")) return false;

        // Ignore javascript pseudo links
        if (href.trim().toLowerCase().startsWith("javascript:")) return false;

        // Only same-origin navigations
        try {
            const url = new URL(href, window.location.href);
            if (url.origin !== window.location.origin) return false;

            // If only hash changes on same path, don't show splash
            const samePath = (url.pathname === window.location.pathname);
            const onlyHashChange = samePath && (url.search === window.location.search) && (url.hash && url.hash.length > 1);
            if (onlyHashChange) return false;

            // If navigating to exact same URL, don't splash
            if (url.href === window.location.href) return false;

            return true;
        } catch {
            return false;
        }
    }

    function bindSplashToNavigation() {
        // Show splash on link clicks (capture so it runs before navigation)
        document.addEventListener("click", (e) => {
            const a = e.target.closest("a");
            if (!isInternalNavigableLink(a)) return;
            showSplash();

            // If navigation doesn't happen (preventDefault/AJAX), don't get stuck
            setTimeout(() => {
                if (document.visibilityState === "visible") hideSplash();
            }, 800);
        }, true);

        // Show splash on form submits too (optional)
        document.addEventListener("submit", (e) => {
            // Only for real submits
            showSplash();

            // If the submit is prevented (AJAX forms), immediately hide again.
            // This avoids the splash getting stuck when navigation does not occur.
            setTimeout(() => {
                if (e.defaultPrevented) hideSplash();
            }, 0);
        }, true);

        // Back/forward cache handling
        window.addEventListener("pageshow", () => {
            // If coming back from bfcache, ensure splash is hidden
            hideSplash();
        });

        // Ensure splash is hidden once the page fully loads
        window.addEventListener("load", () => {
            hideSplash();
        }, { once: true });

        // If browser is unloading (manual refresh/navigation), show splash quickly
        window.addEventListener("beforeunload", () => {
            showSplash();
        });
    }

    // =========================
    // INJECT GLOBAL PARTIALS
    // =========================
    async function inject(id, path, label) {
        const el = document.getElementById(id);
        if (!el) return false;

        try {
            const res = await fetch(path);
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            el.innerHTML = await res.text();
            return true;
        } catch (err) {
            console.error(`Failed to load ${label}:`, err);
            return false;
        }
    }

    // =========================
    // ROLE-BASED ACCESS (GLOBAL)
    // =========================
    const API_TEACHERS = "/api/settings/teachers";

    function normalizeRole(roleRaw) {
        const r = String(roleRaw || "").trim().toLowerCase();
        if (r === "super_admin" || r === "superadmin" || r === "super admin") return "SUPER_ADMIN";
        if (r === "admin") return "ADMIN";
        return "TEACHER";
    }

    function getCurrentUserEmail() {
        return (localStorage.getItem("currentUserEmail") || "").trim().toLowerCase();
    }

    async function fetchJson(url) {
        const token = localStorage.getItem("token");

        const res = await fetch(url, {
            headers: {
                "Accept": "application/json",
                ...(token ? { "Authorization": `Bearer ${token}` } : {})
            }
        });

        // Not logged in / token invalid
        if (res.status === 401 || res.status === 403) {
            window.location.href = "/ZClassScheduler/html/Login.html";
            return null;
        }

        if (!res.ok) return null;

        try {
            return await res.json();
        } catch {
            return null;
        }
    }

    async function resolveRoleFromTeachers() {
        const email = getCurrentUserEmail();
        if (!email) return "TEACHER";

        const teachers = await fetchJson(API_TEACHERS);
        if (!Array.isArray(teachers)) return "TEACHER";

        const match = teachers.find(t =>
            String(t?.email || "").trim().toLowerCase() === email
        );

        if (!match) return "TEACHER";

        // If inactive, downgrade access
        const status = String(match?.status || "Active").trim().toLowerCase();
        if (status !== "active") return "TEACHER";

        return normalizeRole(match?.role);
    }

    // =========================
    // NAV VISIBILITY (uses nav.html data-role attributes)
    // =========================
    function applyNavRoleVisibility(role) {
        document.querySelectorAll("[data-role]").forEach(el => {
            const allowed = String(el.getAttribute("data-role") || "")
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);

            if (allowed.length === 0) {
                el.style.display = "";
                return;
            }

            el.style.display = allowed.includes(role) ? "" : "none";
        });
    }

    // =========================
    // DIRECT URL ACCESS RULES
    // =========================
    const PAGE_RULES = [
        { file: "ManageCurriculum.html", allow: ["SUPER_ADMIN"] },
        { file: "ManageCourse.html", allow: ["SUPER_ADMIN"] },
        { file: "ManageRoom.html", allow: ["ADMIN", "SUPER_ADMIN"] },
        { file: "ManageTeacher.html", allow: ["ADMIN", "SUPER_ADMIN"] },
    ];

    function currentFileName() {
        const p = window.location.pathname;
        return decodeURIComponent((p.split("/").pop() || ""));
    }

    function redirectUnauthorized() {
        window.location.href = "/ZClassScheduler/html/Dashboard.html";
    }

    function enforceDirectUrlRules(role) {
        const file = currentFileName();
        const rule = PAGE_RULES.find(r => r.file === file);
        if (!rule) return;

        if (!rule.allow.includes(role)) {
            redirectUnauthorized();
        }
    }

    // =========================
    // BOOT
    // =========================
    injectSplash();
    bindSplashToNavigation();

    // Make sure we never start stuck
    hideSplash();

    const role = await resolveRoleFromTeachers();
    applyNavRoleVisibility(role);
    enforceDirectUrlRules(role);

    await Promise.all([
        inject("global-header", "../HTML/GlobalHeader.html", "header"),
        inject("global-nav", "../HTML/GlobalSidebar.html", "nav"),
        inject("searchContainer", "../HTML/GlobalSearch.html", "search")
    ]);

    // Hide splash once initialization is done
    hideSplash();
})();

