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
<div class="txt">Loading...</div>
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

    // Track pending fetches so the splash can cover "page not ready yet" states.
    let pendingFetches = 0;
    let showDelayTimer = null;
    let minVisibleUntil = 0;

    function beginBusy() {
        pendingFetches += 1;
        minVisibleUntil = Math.max(minVisibleUntil, Date.now() + 250);

        // Show after a short delay to avoid flicker for fast requests.
        if (showDelayTimer == null) {
            showDelayTimer = setTimeout(() => {
                showDelayTimer = null;
                if (pendingFetches > 0) showSplash();
            }, 120);
        }
    }

    function endBusy() {
        pendingFetches = Math.max(0, pendingFetches - 1);
        if (pendingFetches !== 0) return;

        const wait = Math.max(0, minVisibleUntil - Date.now());
        setTimeout(() => {
            if (pendingFetches === 0) hideSplash();
        }, wait);
    }

    // Wrap fetch globally for same-origin API/data calls so the splash stays up
    // while the page is still loading its details.
    const _fetch = window.fetch ? window.fetch.bind(window) : null;
    if (_fetch) {
        window.fetch = async (...args) => {
            let tracked = false;
            try {
                const url = args?.[0];
                const u = (typeof url === "string") ? url : (url?.url || "");
                const sameOrigin = (() => {
                    try {
                        if (!u) return true;
                        const parsed = new URL(u, window.location.href);
                        return parsed.origin === window.location.origin;
                    } catch {
                        return true;
                    }
                })();

                const shouldTrack = sameOrigin && (
                    u.startsWith("/api/") ||
                    u.startsWith("/dashboard/") ||
                    u.startsWith("/settings/") ||
                    u.startsWith("../") ||
                    u.startsWith("/ZClassScheduler/")
                );

                if (shouldTrack) {
                    tracked = true;
                    beginBusy();
                }
                return await _fetch(...args);
            } finally {
                // If we showed the splash for this request, close it when done.
                if (tracked) endBusy();
            }
        };
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
                if (document.visibilityState === "visible" && pendingFetches === 0) hideSplash();
            }, 800);
        }, true);

        // Show splash on form submits too (optional)
        document.addEventListener("submit", (e) => {
            // Only for real submits
            showSplash();

            // If the submit is prevented (AJAX forms), immediately hide again.
            // This avoids the splash getting stuck when navigation does not occur.
            setTimeout(() => {
                if (e.defaultPrevented && pendingFetches === 0) hideSplash();
            }, 0);
        }, true);

        // Back/forward cache handling
        window.addEventListener("pageshow", () => {
            // If coming back from bfcache, ensure splash is hidden
            if (pendingFetches === 0) hideSplash();
        });

        // Once the page fully loads, hide only if we're not waiting on data fetches.
        window.addEventListener("load", () => {
            if (pendingFetches === 0) hideSplash();
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
        if (r === "checker") return "CHECKER";
        if (r === "non_teaching" || r === "non-teaching" || r === "non teaching" || r === "nonteaching") return "NON_TEACHING";
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
        // Teachers can only view the schedule pages.
        { file: "Dashboard.html", allow: ["ADMIN", "SUPER_ADMIN"] },

        // Scheduler pages (building schedules) are ADMIN/SUPER_ADMIN only.
        { file: "SchedulerSTI.html", allow: ["ADMIN", "SUPER_ADMIN"] },
        { file: "SchedulerNAMEI.html", allow: ["ADMIN", "SUPER_ADMIN"] },
        { file: "SchedulerJHS.html", allow: ["ADMIN", "SUPER_ADMIN"] },
        { file: "SchedulerSHS.html", allow: ["ADMIN", "SUPER_ADMIN"] },

        // Settings pages
        { file: "ManageTeacher.html", allow: ["ADMIN", "SUPER_ADMIN"] },
        { file: "ManageRoom.html", allow: ["SUPER_ADMIN"] },
        { file: "ManageCurriculum.html", allow: ["SUPER_ADMIN"] },
        { file: "ManageCourse.html", allow: ["SUPER_ADMIN"] },
        { file: "AuditLogs.html", allow: ["SUPER_ADMIN"] },
        { file: "CheckerLogs.html", allow: ["CHECKER", "ADMIN", "SUPER_ADMIN"] },
    ];

    function currentFileName() {
        const p = window.location.pathname;
        return decodeURIComponent((p.split("/").pop() || ""));
    }

    function redirectUnauthorized(role) {
        if (role === "TEACHER" || role === "CHECKER" || role === "NON_TEACHING") {
            window.location.href = "/ZClassScheduler/html/SchedulesOverview.html";
            return;
        }
        window.location.href = "/ZClassScheduler/html/Dashboard.html";
    }

    function enforceDirectUrlRules(role) {
        const file = currentFileName();
        const rule = PAGE_RULES.find(r => r.file === file);
        if (!rule) return;

        if (!rule.allow.includes(role)) {
            redirectUnauthorized(role);
        }
    }

    // =========================
    // GLOBAL BUTTON ICONIZER
    // =========================
    const BTN_ICONS = {
        view: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>`,
        edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.7 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L20.7 7.04z"/></svg>`,
        delete: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9zm-1 14h12a2 2 0 0 0 2-2V7H4v14a2 2 0 0 0 2 2z"/></svg>`,
        add: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v14h-2V5zm-6 6h14v2H5v-2z"/></svg>`,
        refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 13.65-6.65z"/></svg>`,
        upload: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zM12 2 6.5 7.5l1.4 1.4L11 5.8V16h2V5.8l3.1 3.1 1.4-1.4L12 2z"/></svg>`,
        save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zM12 19a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM6 5h9v4H6V5z"/></svg>`,
        cancel: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4z"/></svg>`,
        close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3 1.4 1.4z"/></svg>`,
        login: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17v-2h4v-6h-4V7l-5 5 5 5zm9-14H11a2 2 0 0 0-2 2v3h2V5h8v14h-8v-3H9v3a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/></svg>`,
        logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 17v-2H7V9h9V7l5 5-5 5zM3 3h9a2 2 0 0 1 2 2v3h-2V5H3v14h9v-3h2v3a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/></svg>`,
        // Clock icon (ring + hands) so it doesn't look like a solid dark circle at 16px.
        clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20a10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16a8 8 0 0 0 0-16z"/><path d="M12 6a1 1 0 0 1 1 1v5h4a1 1 0 1 1 0 2h-5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/></svg>`,
        calendar: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h2v2h6V2h2v2h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3V2zm15 8H2v10h20V10z"/></svg>`,
        activate: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>`,
        deactivate: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2zm0 2a8 8 0 0 1 6.32 12.9L7.1 5.68A7.97 7.97 0 0 1 12 4zm0 16a7.97 7.97 0 0 1-4.9-1.68L18.32 7.1A8 8 0 0 1 12 20z"/></svg>`,
    };

    function detectButtonKind(el) {
        if (!el) return null;
        const cls = el.classList;
        const action = (el.getAttribute("data-action") || "").trim().toLowerCase();
        if (action === "view") return "view";
        if (action === "edit" || action === "edit-row") return "edit";
        if (action === "delete" || action === "delete-row") return "delete";
        if (action === "upload") return "upload";
        if (action === "activate") return "activate";
        if (action === "deactivate") return "deactivate";
        if (action === "admintime" || action === "admin_time" || action === "admin-time") return "clock";

        if (cls.contains("btn-edit")) return "edit";
        if (cls.contains("btn-delete")) return "delete";
        if (cls.contains("btn-view")) return "view";

        const raw = (el.getAttribute("data-label") || el.textContent || "").trim();
        const t = raw.replace(/^\+/, "").trim().toLowerCase();
        if (!t) return null;
        if (t === "view") return "view";
        if (t === "edit") return "edit";
        if (t === "delete") return "delete";
        if (t === "refresh") return "refresh";
        if (t === "upload") return "upload";
        if (t === "save" || t === "create") return "save";
        if (t === "cancel") return "cancel";
        if (t === "close") return "close";
        if (t.startsWith("add ")) return "add";
        if (t.startsWith("upload ")) return "upload";
        if (t === "activate") return "activate";
        if (t === "deactivate") return "deactivate";
        if (t === "admin time") return "clock";
        if (t === "weekly view" || t === "daily view") return "calendar";
        if (t === "login") return "login";
        if (t === "logout") return "logout";
        return null;
    }

    function iconizeButtons(root) {
        const scope = root || document;
        const nodes = scope.querySelectorAll?.("button.btn, a.btn, input.btn") || [];
        nodes.forEach((el) => {
            if (el.dataset?.noIconize === "1") return;
            if (el.classList?.contains("btn-icon")) return; // already icon-only
            if (el.querySelector?.("svg")) return; // already has svg icon
            if (String(el.tagName || "").toUpperCase() === "INPUT") return; // avoid breaking form submits

            const kind = detectButtonKind(el);
            const svg = kind ? BTN_ICONS[kind] : null;
            if (!svg) return;

            const label = (el.getAttribute("data-label") || el.textContent || "").trim() || kind;
            el.setAttribute("data-label", label);
            if (!el.getAttribute("title")) el.setAttribute("title", label);
            if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", label);

            el.innerHTML = svg;
            el.classList.add("btn-icon");
        });
    }

    function bindIconizeObserver() {
        const obs = new MutationObserver((mutations) => {
            for (const m of mutations) {
                m.addedNodes?.forEach((n) => {
                    if (n.nodeType !== 1) return;
                    iconizeButtons(n);
                });
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    // =========================
    // BOOT
    // =========================
    injectSplash();
    bindSplashToNavigation();

    // Start visible on initial load; fetch wrappers will keep it up while data is loading.
    showSplash();
    minVisibleUntil = Date.now() + 300;

    const role = await resolveRoleFromTeachers();
    applyNavRoleVisibility(role);
    enforceDirectUrlRules(role);

    await Promise.all([
        inject("global-header", "../HTML/GlobalHeader.html", "header"),
        inject("global-nav", "../HTML/GlobalSidebar.html", "nav"),
        inject("searchContainer", "../HTML/GlobalSearch.html", "search")
    ]);

    // Apply role visibility again after partials are injected (prevents a brief flash of restricted links).
    applyNavRoleVisibility(role);

    // Replace common action button labels with icons across pages (including dynamically rendered tables).
    iconizeButtons(document);
    bindIconizeObserver();

    // Hide splash once initialization is done (if nothing else is still fetching).
    if (pendingFetches === 0) hideSplash();
})();

