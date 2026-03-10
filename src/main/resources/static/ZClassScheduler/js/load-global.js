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
    // APP DIALOG (GLOBAL, replaces alert())
    // =========================
    const DIALOG_ID = "appDialogOverlay";

    function ensureAppDialog() {
        if (document.getElementById(DIALOG_ID)) return;

        const wrap = document.createElement("div");
        wrap.id = DIALOG_ID;
        wrap.className = "app-dialog-backdrop hidden";
        wrap.innerHTML = `
  <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="appDialogTitle">
    <h3 class="title" id="appDialogTitle">Message</h3>
    <p class="msg" id="appDialogMsg"></p>
    <div class="actions">
      <button type="button" class="btn btn-secondary" id="appDialogCancelBtn" style="display:none;">Cancel</button>
      <button type="button" class="btn btn-primary" id="appDialogOkBtn">OK</button>
    </div>
  </div>
`;
        document.body.appendChild(wrap);

        const ok = wrap.querySelector("#appDialogOkBtn");
        const cancel = wrap.querySelector("#appDialogCancelBtn");
        ok?.addEventListener("click", () => {
            const mode = wrap.getAttribute("data-mode") || "alert";
            if (mode === "alert") window.appDialogClose?.();
        });
        cancel?.addEventListener("click", () => {
            const mode = wrap.getAttribute("data-mode") || "alert";
            if (mode === "alert") window.appDialogClose?.();
        });

        // Click outside closes for alert-only; confirm requires explicit choice.
        wrap.addEventListener("click", (e) => {
            if (e.target === wrap) {
                const mode = wrap.getAttribute("data-mode") || "alert";
                if (mode === "alert") window.appDialogClose?.();
            }
        });
    }

    function setDialogVisible(visible) {
        const el = document.getElementById(DIALOG_ID);
        if (!el) return;
        el.classList.toggle("hidden", !visible);
    }

    function setDialogContent({ title, message, mode, okText, cancelText }) {
        const el = document.getElementById(DIALOG_ID);
        if (!el) return;
        el.setAttribute("data-mode", mode || "alert");

        const t = el.querySelector("#appDialogTitle");
        const m = el.querySelector("#appDialogMsg");
        const ok = el.querySelector("#appDialogOkBtn");
        const cancel = el.querySelector("#appDialogCancelBtn");

        if (t) t.textContent = title || "Message";
        if (m) m.textContent = String(message ?? "");
        if (ok) ok.textContent = okText || "OK";

        if (cancel) {
            if ((mode || "alert") === "confirm") {
                cancel.style.display = "";
                cancel.textContent = cancelText || "Cancel";
            } else {
                cancel.style.display = "none";
            }
        }
    }

    let __dialogResolve__ = null;
    window.appDialogClose = function () {
        __dialogResolve__?.(null);
        __dialogResolve__ = null;
        setDialogVisible(false);
    };

    window.appAlert = function (message, opts = {}) {
        ensureAppDialog();
        const el = document.getElementById(DIALOG_ID);
        if (!el) return;

        setDialogContent({
            title: opts.title || "Message",
            message,
            mode: "alert",
            okText: opts.okText || "OK",
        });

        setDialogVisible(true);

        const ok = el.querySelector("#appDialogOkBtn");
        if (ok) ok.focus();

        // No need to await; keep API similar to alert().
    };

    window.appConfirm = function (message, opts = {}) {
        ensureAppDialog();
        const el = document.getElementById(DIALOG_ID);
        if (!el) return Promise.resolve(false);

        setDialogContent({
            title: opts.title || "Confirm",
            message,
            mode: "confirm",
            okText: opts.okText || "OK",
            cancelText: opts.cancelText || "Cancel",
        });

        setDialogVisible(true);

        return new Promise((resolve) => {
            __dialogResolve__ = resolve;

            const ok = el.querySelector("#appDialogOkBtn");
            const cancel = el.querySelector("#appDialogCancelBtn");

            const cleanup = () => {
                ok?.removeEventListener("click", onOk);
                cancel?.removeEventListener("click", onCancel);
                document.removeEventListener("keydown", onKey);
            };

            const finish = (v) => {
                cleanup();
                __dialogResolve__ = null;
                setDialogVisible(false);
                resolve(v);
            };

            const onOk = () => finish(true);
            const onCancel = () => finish(false);
            const onKey = (e) => {
                if (e.key === "Escape") finish(false);
            };

            ok?.addEventListener("click", onOk);
            cancel?.addEventListener("click", onCancel);
            document.addEventListener("keydown", onKey);

            ok?.focus();
        });
    };

    // =========================
    // USER MENU ACTIONS (HELP + CHANGE PASSWORD)
    // =========================
    const TOUR_ID = "appHelpTourOverlay";

    function pageFileName() {
        const p = window.location.pathname;
        return decodeURIComponent((p.split("/").pop() || ""));
    }

    const HELP_TOURS = {
        "ManageTeacher.html": [
            { title: "Welcome", text: "This page lets you create and manage user accounts.\nWe will walk through search, add user, and edit user.", selector: ".page-header" },
            { title: "Search users", text: "Type a name, email, department, or role to filter the table.", selector: "#searchInput", demo: { actions: [{ type: "type", selector: "#searchInput", value: "john", ms: 700 }] } },
            { title: "Add user", text: "Click + Add User to open the Add User modal.", selector: "#addTeacherBtn", demo: { actions: [{ type: "click", selector: "#addTeacherBtn", real: true, ms: 300 }] } },

            // Modal walkthrough (what to input + sample demo)
            { title: "First name", text: "Enter the user's first name.", selector: "#empFn", ensure: [{ type: "click", selector: "#addTeacherBtn", real: true, ms: 250 }], demo: { actions: [{ type: "type", selector: "#empFn", value: "Juan", ms: 700 }] } },
            { title: "Last name", text: "Enter the user's last name.", selector: "#empLn", demo: { actions: [{ type: "type", selector: "#empLn", value: "Dela Cruz", ms: 700 }] } },
            { title: "Department", text: "Pick the department. Use STAFF for staff users.", selector: "#type", demo: { actions: [{ type: "select", selector: "#type", value: "ICT", ms: 700 }] } },
            { title: "Email", text: "Enter the login email address.", selector: "#email", demo: { actions: [{ type: "type", selector: "#email", value: "juan.delacruz@school.edu", ms: 700 }] } },
            { title: "Role", text: "Choose the role. Admin permissions may limit which roles you can assign.", selector: "#role", demo: { actions: [{ type: "select", selector: "#role", value: "TEACHER", ms: 700 }] } },
            { title: "Default password", text: "Password is generated automatically.\nTo reset later, open Edit and click Reset Password.", selector: "#teacherModal .hint" },
            { title: "Save / Cancel", text: "Click Save to create/update the user.\nClick Cancel to close without saving.", selector: "#teacherForm .modal-actions", demo: { actions: [{ type: "click", selector: "#cancelBtn", real: true, ms: 250 }] } },

            { title: "Edit an existing user", text: "Use Edit to update details. Password is not editable here.\nUse Reset Password to set it back to the default.", selector: "#teacherTable tbody tr:first-child [data-action='edit']", demo: { actions: [{ type: "click", selector: "#teacherTable tbody tr:first-child [data-action='edit']", real: true, ms: 350 }, { type: "wait", ms: 350 }, { type: "click", selector: "#cancelBtn", real: true, ms: 200 }] } },
        ],

        "ManageRoom.html": [
            { title: "Welcome", text: "This page lets you create and manage rooms.\nWe will show how to add a room and how to edit existing rooms.", selector: ".page-header" },
            { title: "Search rooms", text: "Use search to quickly find a room by code, floor, type, or status.", selector: "#searchInput", demo: { actions: [{ type: "type", selector: "#searchInput", value: "LAB", ms: 700 }] } },
            { title: "Add room", text: "Click + Add Room to open the room modal.", selector: "#addRoomBtn", demo: { actions: [{ type: "click", selector: "#addRoomBtn", real: true, ms: 300 }] } },
            { title: "Room code", text: "Enter a short room code (example: RM101).", selector: "#roomCode", ensure: [{ type: "click", selector: "#addRoomBtn", real: true, ms: 250 }], demo: { actions: [{ type: "type", selector: "#roomCode", value: "RM101", ms: 700 }] } },
            { title: "Floor / Capacity", text: "Set floor and capacity. Capacity should be a number.", selector: "#capacity", demo: { actions: [{ type: "type", selector: "#floor", value: "1", ms: 450 }, { type: "type", selector: "#capacity", value: "40", ms: 450 }] } },
            { title: "Type / Status", text: "Pick the room type and status.", selector: "#type", demo: { actions: [{ type: "selectFirst", selector: "#type", ms: 600 }, { type: "selectFirst", selector: "#status", ms: 600 }] } },
            { title: "Save / Cancel", text: "Click Save to store the room.\nClick Cancel to close without saving.", selector: "#roomForm .crud-scope", demo: { actions: [{ type: "click", selector: "#cancelBtn", real: true, ms: 250 }] } },
            { title: "Edit / Delete", text: "Use Edit to update a room and Delete to remove it (if available).", selector: "#roomTable", demo: { actions: [{ type: "click", selector: "#roomTable tbody tr:first-child [data-action='edit']", ms: 450 }] } },
        ],

        "ManageCourse.html": [
            { title: "Welcome", text: "This page lets you create and manage courses (course code + name).", selector: ".page-header" },
            { title: "Search courses", text: "Use search to filter the courses list.", selector: "#searchInput", demo: { actions: [{ type: "type", selector: "#searchInput", value: "BS", ms: 700 }] } },
            { title: "Add course", text: "Click + Add Course to open the course modal.", selector: "#addCourseBtn", demo: { actions: [{ type: "click", selector: "#addCourseBtn", real: true, ms: 300 }] } },
            { title: "Course code", text: "Enter a short code (example: BSCS).", selector: "#courseCode", ensure: [{ type: "click", selector: "#addCourseBtn", real: true, ms: 250 }], demo: { actions: [{ type: "type", selector: "#courseCode", value: "BSCS", ms: 700 }] } },
            { title: "Course name", text: "Enter the full course name.", selector: "#courseName", demo: { actions: [{ type: "type", selector: "#courseName", value: "Bachelor of Science in Computer Science", ms: 700 }] } },
            { title: "Level / Status", text: "Choose the school level (Tertiary/SHS/JHS) and status.", selector: "#levelType", demo: { actions: [{ type: "selectFirst", selector: "#levelType", ms: 700 }, { type: "selectFirst", selector: "#status", ms: 700 }] } },
            { title: "Save / Cancel", text: "Click Save to store the course.\nClick Cancel to close without saving.", selector: "#courseForm .modal-actions", demo: { actions: [{ type: "click", selector: "#cancelBtn", real: true, ms: 250 }] } },
        ],

        "ManageCurriculum.html": [
            { title: "Welcome", text: "This page manages curriculums.\nYou can upload a PDF or manually create a curriculum.", selector: ".page-header" },
            { title: "Search curriculums", text: "Use search to filter curriculum code, program, department, or status.", selector: "#searchInput", demo: { actions: [{ type: "type", selector: "#searchInput", value: "BS", ms: 700 }] } },

            { title: "Upload curriculum", text: "Click Upload Curriculum to open the upload modal.", selector: "#uploadBtn", demo: { actions: [{ type: "click", selector: "#uploadBtn", real: true, ms: 300 }] } },
            { title: "Upload modal inputs", text: "Select the PDF, set the curriculum code and department.\nProgram is auto-detected after parsing.", selector: "#uploadModal", ensure: [{ type: "click", selector: "#uploadBtn", real: true, ms: 250 }] },
            { title: "Close upload modal", text: "Click Cancel to close the upload modal.", selector: "#closeUploadModal", demo: { actions: [{ type: "click", selector: "#closeUploadModal", real: true, ms: 250 }] } },

            { title: "Manual create", text: "Click Manual Create to open the manual create modal.", selector: "#manualCreateBtn", demo: { actions: [{ type: "click", selector: "#manualCreateBtn", real: true, ms: 300 }] } },
            { title: "Manual create inputs", text: "Select Department and Program, then enter Curriculum Code.\nUse Create Template to generate rows, and Add Subject Row to add more.", selector: "#manualCreateModal", ensure: [{ type: "click", selector: "#manualCreateBtn", real: true, ms: 250 }] },
            { title: "Create template", text: "Creates a starter set of subject rows for the selected department/program.", selector: "#manualTemplateBtn", demo: { actions: [{ type: "click", selector: "#manualTemplateBtn", ms: 450 }] } },
            { title: "Close manual create", text: "Click Cancel to close manual create without saving.", selector: "#manualCloseBtn", demo: { actions: [{ type: "click", selector: "#manualCloseBtn", real: true, ms: 250 }] } },

            { title: "Delete mode", text: "Delete Curriculum toggles delete mode. Use carefully.", selector: "#deleteModeBtn" },
        ],

        "SchedulesOverview.html": [
            { title: "Welcome", text: "This page shows all schedules in a master list.\nUse search to filter and download for Excel.", selector: ".page-header" },
            { title: "Search schedules", text: "Search by section, subject, room, teacher, day, or department.", selector: "#searchInput", demo: { actions: [{ type: "type", selector: "#searchInput", value: "ICT", ms: 700 }] } },
            { title: "Refresh", text: "Click Refresh to reload the latest schedules.", selector: "#refreshOverviewBtn", demo: { actions: [{ type: "click", selector: "#refreshOverviewBtn", ms: 450 }] } },
            { title: "Download Excel", text: "Download the visible table as CSV (opens in Excel).", selector: "#downloadOverviewExcelBtn", demo: { actions: [{ type: "click", selector: "#downloadOverviewExcelBtn", ms: 450 }] } },
        ],

        "SchedulesRoom.html": [
            { title: "Welcome", text: "This page shows room schedules.\nWeekly View is one room. Daily View is many rooms for one day.", selector: ".page-header" },
            { title: "Search room (weekly)", text: "Search a room to load its weekly schedule.", selector: "#roomSearch", demo: { actions: [{ type: "type", selector: "#roomSearch", value: "RM", ms: 700 }] } },
            { title: "Switch to daily view", text: "Daily View shows many rooms for one selected day.", selector: "#dailyViewBtn", demo: { actions: [{ type: "click", selector: "#dailyViewBtn", real: true, ms: 350 }] } },
            { title: "Pick a day", text: "Choose which day to show in daily view.", selector: "#dailyDaySelect", demo: { actions: [{ type: "select", selector: "#dailyDaySelect", value: "MON", ms: 700 }] } },
            { title: "Filter room columns", text: "Use this to reduce visible room columns in daily view.", selector: "#dailyRoomSearch", demo: { actions: [{ type: "type", selector: "#dailyRoomSearch", value: "101", ms: 700 }] } },
            { title: "Download Excel", text: "Exports the daily room table as CSV (Excel).", selector: "#downloadDailyExcelBtn", demo: { actions: [{ type: "click", selector: "#downloadDailyExcelBtn", ms: 450 }] } },
            { title: "Print (daily)", text: "Print daily view: all rows on each page, columns continue to the next page.", selector: "#printBtn", demo: { actions: [{ type: "click", selector: "#printBtn", ms: 450 }] } },
            { title: "Back to weekly view", text: "Weekly View focuses on one room.", selector: "#weeklyViewBtn", demo: { actions: [{ type: "click", selector: "#weeklyViewBtn", real: true, ms: 350 }] } },
        ],

        "SchedulesTeacher.html": [
            { title: "Welcome", text: "This page shows a teacher's weekly schedule.\nSearch a teacher then print if needed.", selector: ".page-header" },
            { title: "Search teacher", text: "Search a teacher to load the weekly timetable.", selector: "#teacherSearch", demo: { actions: [{ type: "type", selector: "#teacherSearch", value: "Maria", ms: 700 }] } },
            { title: "Print", text: "Print the weekly teacher schedule in landscape. The grid is scaled to fit a page.", selector: "#printBtn", demo: { actions: [{ type: "click", selector: "#printBtn", ms: 450 }] } },
        ],

        "SchedulerSTI.html": [
            { title: "Add Schedule Block", text: "Click + Add Schedule to open the block wizard.", selector: "#addBlockBtn", demo: { actions: [{ type: "click", selector: "#addBlockBtn", real: true, ms: 350 }] } },
            { title: "Program / Course", text: "Select the program for the block.", selector: "#programSelect", demo: { actions: [{ type: "selectFirst", selector: "#programSelect", ms: 700 }] } },
            { title: "Curriculum", text: "Select the curriculum under the chosen program.", selector: "#curriculumSelect", demo: { actions: [{ type: "selectFirst", selector: "#curriculumSelect", ms: 700 }] } },
            { title: "Year / Term", text: "Pick year level and term for the block.", selector: "#wizardForm .form-grid", demo: { actions: [{ type: "select", selector: "#yearSelect", value: "1", ms: 500 }, { type: "select", selector: "#termSelect", value: "1", ms: 500 }] } },
            { title: "Create / Cancel", text: "Click Create to create the block.\nClick Cancel to close without changes.", selector: "#wizardForm .modal-actions", demo: { actions: [{ type: "click", selector: "#wizardCancelBtn", real: true, ms: 250 }] } },

            { title: "Edit a schedule row", text: "In the table, click the pencil icon to open the edit modal for a row.", selector: "#blocksTable [data-action='edit-row']", demo: { actions: [{ type: "click", selector: "#blocksTable [data-action='edit-row']", real: true, ms: 350 }] } },
            { title: "Edit modal inputs", text: "Set Day, Time, Room, and Instructor here.\nYou can close anytime with Cancel.", selector: "#editRowModal", ensure: [{ type: "click", selector: "#blocksTable [data-action='edit-row']", real: true, ms: 300 }], demo: { actions: [{ type: "click", selector: "#editSuggestBtn", ms: 450 }] } },
            { title: "Suggestions", text: "Suggest finds a day/time/room that fits both instructor and section schedules.", selector: "#editSuggestBtn", ensure: [{ type: "click", selector: "#blocksTable [data-action='edit-row']", real: true, ms: 300 }], demo: { actions: [{ type: "click", selector: "#editSuggestBtn", ms: 450 }] } },
            { title: "Save / Cancel", text: "Click Save to apply changes.\nClick Cancel to close without saving.", selector: "#editRowForm .modal-actions", ensure: [{ type: "click", selector: "#blocksTable [data-action='edit-row']", real: true, ms: 300 }], demo: { actions: [{ type: "click", selector: "#editCancelBtn", real: true, ms: 250 }] } },
        ],

        "SchedulerNAMEI.html": [],
        "SchedulerJHS.html": [],
        "SchedulerSHS.html": [],
        "Dashboard.html": [
            { title: "Navigation", text: "Use the sidebar to open schedules and settings pages.", selector: "#global-nav" },
        ],

        "AuditLogs.html": [
            { title: "Welcome", text: "Audit Logs shows privileged actions done by ADMIN/SUPER_ADMIN.\nUse search and filters to find entries, then print if needed.", selector: ".page-header" },
            { title: "Search", text: "Search by who/what/action/message.", selector: "#q", demo: { actions: [{ type: "type", selector: "#q", value: "teacher", ms: 700 }] } },
            { title: "Filters", text: "Filter by role and success/failure.", selector: "#roleFilter", demo: { actions: [{ type: "selectFirst", selector: "#roleFilter", ms: 600 }, { type: "selectFirst", selector: "#successFilter", ms: 600 }] } },
            { title: "Refresh", text: "Reload the latest audit logs.", selector: "#refreshBtn", demo: { actions: [{ type: "click", selector: "#refreshBtn", ms: 450 }] } },
            { title: "Print", text: "Print the current table view in landscape.", selector: "#printBtn", demo: { actions: [{ type: "click", selector: "#printBtn", ms: 450 }] } },
            { title: "Load more", text: "Loads more entries if available.", selector: "#loadMoreBtn" },
        ],
    };

    function commonTourSteps() {
        return [
            { title: "Sidebar", text: "Use the hamburger button to open/close the sidebar (especially on mobile).", selector: "#sidebarToggle", demo: { actions: [{ type: "click", selector: "#sidebarToggle", real: true, ms: 450 }] } },
            { title: "User menu", text: "Use the kebab menu for Help, Change password, and Logout.", selector: "#userMenuBtn", demo: { actions: [{ type: "click", selector: "#userMenuBtn", real: true, ms: 450 }] } },
        ];
    }

    let __tourSteps__ = [];
    let __tourIndex__ = 0;
    let __tourViewportBound__ = false;
    const __tourEnsured__ = new Set();

    function ensureTourOverlay() {
        if (document.getElementById(TOUR_ID)) return;

        const wrap = document.createElement("div");
        wrap.id = TOUR_ID;
        wrap.className = "tour-backdrop hidden";
        wrap.innerHTML = `
  <div class="tour-spotlight" id="tourSpotlight"></div>
  <div class="tour-card" id="tourCard" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
    <div class="tour-top">
      <div class="tour-step" id="tourStep"></div>
      <button type="button" class="tour-close" id="tourCloseBtn" aria-label="Close tour">&times;</button>
    </div>
    <h3 class="tour-title" id="tourTitle"></h3>
    <div class="tour-text" id="tourText"></div>
    <div class="tour-actions">
      <button type="button" class="btn btn-secondary" id="tourDemoBtn" style="display:none;">Play demo</button>
      <div class="spacer"></div>
      <button type="button" class="btn btn-secondary" id="tourPrevBtn">Back</button>
      <button type="button" class="btn btn-primary" id="tourNextBtn">Next</button>
    </div>
  </div>
  <div class="tour-cursor hidden" id="tourCursor"></div>
`;
        document.body.appendChild(wrap);

        const close = () => wrap.classList.add("hidden");
        wrap.querySelector("#tourCloseBtn")?.addEventListener("click", close);
        wrap.addEventListener("click", (e) => {
            if (e.target === wrap) close();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") close();
        });
    }

    function findTarget(selector) {
        if (!selector) return null;
        try {
            return document.querySelector(selector);
        } catch {
            return null;
        }
    }

    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

    function positionSpotlight(rect) {
        const wrap = document.getElementById(TOUR_ID);
        const spot = document.getElementById("tourSpotlight");
        if (!wrap || !spot) return;

        if (!rect) {
            spot.style.left = "-9999px";
            spot.style.top = "-9999px";
            spot.classList.remove("pulse");
            return;
        }

        const pad = 10;
        const left = clamp(rect.left - pad, 8, window.innerWidth - 40);
        const top = clamp(rect.top - pad, 8, window.innerHeight - 40);
        const w = clamp(rect.width + (pad * 2), 24, window.innerWidth - 16);
        const h = clamp(rect.height + (pad * 2), 24, window.innerHeight - 16);

        spot.style.left = `${left}px`;
        spot.style.top = `${top}px`;
        spot.style.width = `${w}px`;
        spot.style.height = `${h}px`;
    }

    function positionCard(rect) {
        const card = document.getElementById("tourCard");
        if (!card) return;

        const isMobile = window.matchMedia("(max-width: 900px)").matches;
        if (isMobile || !rect) {
            card.style.left = "";
            card.style.top = "";
            card.style.right = "";
            card.style.bottom = "";
            return;
        }

        const margin = 14;
        const cardRect = card.getBoundingClientRect();

        // Prefer right, else left, else below.
        let left = rect.right + margin;
        let top = rect.top;

        if (left + cardRect.width > window.innerWidth - 12) {
            left = rect.left - margin - cardRect.width;
        }
        if (left < 12) {
            left = clamp(rect.left, 12, window.innerWidth - cardRect.width - 12);
            top = rect.bottom + margin;
        }

        top = clamp(top, 72, window.innerHeight - cardRect.height - 12);
        left = clamp(left, 12, window.innerWidth - cardRect.width - 12);

        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
    }

    function isActuallyVisible(el) {
        if (!el) return false;
        const r = el.getClientRects?.();
        if (!r || r.length === 0) return false;
        const cs = window.getComputedStyle?.(el);
        if (cs && (cs.visibility === "hidden" || cs.display === "none")) return false;
        return true;
    }

    async function runActions(actions) {
        const list = Array.isArray(actions) ? actions : [];
        for (const a of list) {
            const type = String(a?.type || "").trim().toLowerCase();
            const ms = Number.isFinite(a?.ms) ? a.ms : 250;

            if (type === "wait") {
                await new Promise(r => setTimeout(r, Math.max(0, ms)));
                continue;
            }

            const sel = String(a?.selector || "").trim();
            const el = sel ? findTarget(sel) : null;
            if (!el) continue;

            if (type === "click") {
                const rect = el.getBoundingClientRect?.();
                if (rect) {
                    const cursor = document.getElementById("tourCursor");
                    if (cursor) {
                        cursor.classList.remove("hidden");
                        cursor.style.left = `${rect.left + rect.width / 2}px`;
                        cursor.style.top = `${rect.top + rect.height / 2}px`;
                        cursor.classList.remove("click");
                        void cursor.offsetWidth;
                        cursor.classList.add("click");
                        await new Promise(r => setTimeout(r, 180));
                        cursor.classList.add("hidden");
                    }
                }

                if (a?.real === true) {
                    // Guard: never auto-click submit buttons in help demos.
                    const tag = String(el.tagName || "").toUpperCase();
                    const isSubmit = tag === "BUTTON" && String(el.getAttribute("type") || "").toLowerCase() === "submit";
                    if (!isSubmit) el.click?.();
                }

                await new Promise(r => setTimeout(r, Math.max(0, ms)));
                continue;
            }

            if (type === "type") {
                const tag = String(el.tagName || "").toUpperCase();
                if (tag !== "INPUT" && tag !== "TEXTAREA") continue;
                const old = el.value;
                el.focus?.();
                el.value = String(a?.value ?? "");
                el.dispatchEvent(new Event("input", { bubbles: true }));
                await new Promise(r => setTimeout(r, Math.max(0, ms)));
                el.value = old;
                el.dispatchEvent(new Event("input", { bubbles: true }));
                continue;
            }

            if (type === "select" || type === "selectfirst") {
                const tag = String(el.tagName || "").toUpperCase();
                if (tag !== "SELECT") continue;

                const old = el.value;
                let next = old;

                if (type === "selectfirst") {
                    const opt = [...el.options].find(o => o.value && !o.disabled);
                    if (opt) next = opt.value;
                } else {
                    const want = String(a?.value ?? "");
                    const opt = [...el.options].find(o => String(o.value) === want);
                    if (opt) next = opt.value;
                }

                if (next !== old) {
                    el.focus?.();
                    el.value = next;
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                    await new Promise(r => setTimeout(r, Math.max(0, ms)));
                    el.value = old;
                    el.dispatchEvent(new Event("change", { bubbles: true }));
                }
                continue;
            }
        }
    }

    async function playDemo(step, rect) {
        const cursor = document.getElementById("tourCursor");
        if (!cursor || !rect) return;

        // Back-compat: demo.type
        if (step?.demo?.actions) {
            await runActions(step.demo.actions);
            return;
        }

        cursor.classList.remove("hidden");
        cursor.style.left = `${rect.left + rect.width / 2}px`;
        cursor.style.top = `${rect.top + rect.height / 2}px`;
        cursor.classList.remove("click");
        void cursor.offsetWidth;
        cursor.classList.add("click");
        await new Promise(r => setTimeout(r, 550));
        cursor.classList.add("hidden");
    }

    function renderTour() {
        const wrap = document.getElementById(TOUR_ID);
        if (!wrap) return;

        const step = __tourSteps__[__tourIndex__];
        const stepEl = wrap.querySelector("#tourStep");
        const titleEl = wrap.querySelector("#tourTitle");
        const textEl = wrap.querySelector("#tourText");
        const prevBtn = wrap.querySelector("#tourPrevBtn");
        const nextBtn = wrap.querySelector("#tourNextBtn");
        const demoBtn = wrap.querySelector("#tourDemoBtn");
        const spot = wrap.querySelector("#tourSpotlight");

        const total = __tourSteps__.length || 1;
        if (stepEl) stepEl.textContent = `Step ${__tourIndex__ + 1} of ${total}`;
        if (titleEl) titleEl.textContent = String(step?.title || "Help");
        if (textEl) textEl.textContent = String(step?.text || "");

        if (prevBtn) prevBtn.disabled = (__tourIndex__ === 0);
        if (nextBtn) nextBtn.textContent = (__tourIndex__ >= total - 1) ? "Finish" : "Next";

        const tryEnsureAndFind = async () => {
            let t = findTarget(step?.selector);
            if (t && isActuallyVisible(t)) return t;
            if (Array.isArray(step?.ensure) && step.ensure.length && !__tourEnsured__.has(__tourIndex__)) {
                __tourEnsured__.add(__tourIndex__);
                await runActions(step.ensure);
                t = findTarget(step?.selector);
                if (t && isActuallyVisible(t)) return t;
            }
            return t;
        };

        // Ensure needed UI (like modals) is open before measuring.
        Promise.resolve()
            .then(tryEnsureAndFind)
            .then((target) => {
                const rect = (target && isActuallyVisible(target)) ? target.getBoundingClientRect() : null;
                if (rect) target.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "nearest" });

                positionSpotlight(rect);
                positionCard(rect);

                const hasDemo = !!(step?.demo?.actions || step?.demo?.type);
                if (demoBtn) demoBtn.style.display = hasDemo ? "" : "none";
                if (spot) spot.classList.toggle("pulse", hasDemo);

                if (demoBtn) {
                    demoBtn.onclick = async () => playDemo(step, rect);
                }
            });

        // Optimistic immediate layout so the overlay doesn't jump from stale state.
        positionSpotlight(null);
    }

    function startTour(steps) {
        ensureTourOverlay();
        const wrap = document.getElementById(TOUR_ID);
        if (!wrap) return;

        __tourSteps__ = Array.isArray(steps) ? steps.filter(Boolean) : [];
        if (__tourSteps__.length === 0) {
            __tourSteps__ = [{ title: "Help", text: "No step-by-step tour is available for this page yet.", selector: "#global-header" }];
        }
        __tourIndex__ = 0;

        wrap.classList.remove("hidden");

        const prevBtn = wrap.querySelector("#tourPrevBtn");
        const nextBtn = wrap.querySelector("#tourNextBtn");

        prevBtn.onclick = () => {
            __tourIndex__ = Math.max(0, __tourIndex__ - 1);
            renderTour();
        };

        nextBtn.onclick = () => {
            if (__tourIndex__ >= __tourSteps__.length - 1) {
                wrap.classList.add("hidden");
                return;
            }
            __tourIndex__ = Math.min(__tourSteps__.length - 1, __tourIndex__ + 1);
            renderTour();
        };

        renderTour();
        wrap.querySelector("#tourCloseBtn")?.focus?.();

        // Keep spotlight aligned on resize/scroll (bind once).
        if (!__tourViewportBound__) {
            __tourViewportBound__ = true;
            const onViewport = () => {
                const w = document.getElementById(TOUR_ID);
                if (!w || w.classList.contains("hidden")) return;
                renderTour();
            };
            window.addEventListener("resize", onViewport, { passive: true });
            document.addEventListener("scroll", onViewport, true);
        }
    }

    window.showHelpTutorial = function () {
        const key = pageFileName();

        const schedulerFallback = () => {
            if (!/^Scheduler/i.test(key)) return null;
            const sti = HELP_TOURS["SchedulerSTI.html"];
            return Array.isArray(sti) ? sti : null;
        };

        const raw = HELP_TOURS[key] || schedulerFallback();
        const stepsBase = Array.isArray(raw) ? raw.slice() : [];

        function summarizeControls() {
            const scope = document.querySelector("main") || document.body;
            const items = [];

            const candidates = [
                ...scope.querySelectorAll("button"),
                ...scope.querySelectorAll("a.btn"),
            ];

            // Add "functions" that are not buttons but are key to using the site.
            const hasSortable = scope.querySelector("th[data-key]") != null;
            const hasSearch = scope.querySelector("#searchInput, .search-wrapper input") != null;

            if (hasSearch) items.push("Search: type to filter the page results. Use the X button to clear.");
            if (hasSortable) items.push("Sorting: click table headers to sort (where supported).");

            const seen = new Set();
            candidates.forEach((el) => {
                // Ignore tour overlay buttons
                if (el.closest?.(`#${TOUR_ID}`)) return;
                if (!isActuallyVisible(el)) return;

                const label =
                    (el.getAttribute("data-tooltip") || "").trim() ||
                    (el.getAttribute("aria-label") || "").trim() ||
                    (el.getAttribute("title") || "").trim() ||
                    (el.getAttribute("data-label") || "").trim() ||
                    (el.textContent || "").trim();

                if (!label) return;

                const k = `${label}`.toLowerCase();
                if (seen.has(k)) return;
                seen.add(k);

                items.push(`${label}: use this button to run the action.`);
            });

            if (items.length === 0) return "No controls were detected on this page.";

            const capped = items.slice(0, 28);
            const more = items.length > capped.length ? `\n(and ${items.length - capped.length} more…)` : "";
            return capped.map((s) => `- ${s}`).join("\n") + more;
        }

        // If the page has no explicit tour yet, provide a safe, generic tour.
        if (stepsBase.length === 0) {
            stepsBase.push(
                { title: "Welcome", text: "Use Help to learn each screen step-by-step.\nStart by using Search (if available) and the main action buttons.", selector: ".page-header" },
                { title: "Search", text: "Type keywords to filter results. Use clear (X) to reset.", selector: "#searchInput, .search-wrapper input" }
            );
        }

        // Always include an "all controls" summary so every button/function is documented for beginners.
        stepsBase.push({
            title: "All buttons and functions",
            text: summarizeControls(),
            selector: "main",
        });

        // Avoid repeating common tips every time.
        let includeCommon = true;
        try {
            includeCommon = localStorage.getItem("zcsHelpCommonSeen") !== "1";
            if (includeCommon) localStorage.setItem("zcsHelpCommonSeen", "1");
        } catch (_) {
            includeCommon = true;
        }

        const steps = includeCommon ? [...stepsBase, ...commonTourSteps()] : stepsBase;
        startTour(steps);
    };

    // =========================
    // EXPORT (CSV for Excel)
    // =========================
    function csvEscape(v) {
        const s = String(v ?? "");
        if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
        return s;
    }

    function tableToGrid(table) {
        if (!table || !table.rows) return [];

        const grid = [];
        for (let r = 0; r < table.rows.length; r++) {
            const row = table.rows[r];
            if (!grid[r]) grid[r] = [];

            // Find first free column index (skip already-filled by rowspans).
            let cIndex = 0;
            const ensureCol = () => {
                while (grid[r][cIndex] != null) cIndex++;
            };

            for (let ci = 0; ci < row.cells.length; ci++) {
                ensureCol();
                const cell = row.cells[ci];
                const text = (cell?.innerText ?? cell?.textContent ?? "").replace(/\r?\n/g, " ").trim();
                const rs = Math.max(1, cell?.rowSpan || 1);
                const cs = Math.max(1, cell?.colSpan || 1);

                for (let rr = 0; rr < rs; rr++) {
                    for (let cc = 0; cc < cs; cc++) {
                        const tr = r + rr;
                        if (!grid[tr]) grid[tr] = [];
                        // Put text only in the top-left of the span; blanks elsewhere.
                        if (rr === 0 && cc === 0) grid[tr][cIndex + cc] = text;
                        else grid[tr][cIndex + cc] = "";
                    }
                }

                cIndex += cs;
            }
        }

        // Normalize row lengths
        const maxCols = grid.reduce((m, row) => Math.max(m, row.length), 0);
        return grid.map((row) => {
            const out = row.slice();
            while (out.length < maxCols) out.push("");
            return out;
        });
    }

    window.downloadTableAsCsv = function (tableOrId, filenameBase) {
        const table = (typeof tableOrId === "string")
            ? document.getElementById(tableOrId)
            : tableOrId;
        if (!table) {
            window.appAlert?.("Nothing to export.");
            return;
        }

        const grid = tableToGrid(table);
        if (!grid.length) {
            window.appAlert?.("Nothing to export.");
            return;
        }

        const csv = grid.map((row) => row.map(csvEscape).join(",")).join("\r\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });

        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, "0");
        const dd = String(now.getDate()).padStart(2, "0");
        const fn = `${String(filenameBase || "export").trim().replace(/[\\\\/:*?\"<>|]+/g, "_")}_${yyyy}-${mm}-${dd}.csv`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fn;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    };

    // =========================
    // PRINT PREP (scale weekly grids to fit a page)
    // =========================
    const __printRestore__ = [];
    function applyPrintScale() {
        __printRestore__.length = 0;

        // Some pages prepare a custom print-only layout; do not interfere.
        if (document.body?.getAttribute?.("data-print-mode")) return;

        const grids = document.querySelectorAll?.(".schedule-grid") || [];
        const availW = Math.max(1, window.innerWidth - 24);
        const availH = Math.max(1, window.innerHeight - 24);

        grids.forEach((g) => {
            const t = g.querySelector?.("table");
            if (!t) return;

            // Only scale grid-like schedules (not list tables).
            if (!t.classList.contains("schedule-table")) return;

            const w = t.scrollWidth || t.getBoundingClientRect().width || 0;
            const h = t.scrollHeight || t.getBoundingClientRect().height || 0;
            if (!w || !h) return;

            const s = Math.min(1, availW / w, availH / h);
            if (!(s < 1)) return;

            __printRestore__.push({ el: g, style: g.getAttribute("style") || "" });
            g.style.transformOrigin = "top left";
            g.style.transform = `scale(${s.toFixed(4)})`;
            g.style.width = `${(100 / s).toFixed(4)}%`;
        });
    }

    function restorePrintScale() {
        __printRestore__.forEach(({ el, style }) => {
            if (!el) return;
            if (style) el.setAttribute("style", style);
            else el.removeAttribute("style");
        });
        __printRestore__.length = 0;
    }

    window.addEventListener("beforeprint", applyPrintScale);
    window.addEventListener("afterprint", restorePrintScale);

    const CHANGE_PASSWORD_ID = "changePasswordOverlay";

    function ensureChangePasswordModal() {
        if (document.getElementById(CHANGE_PASSWORD_ID)) return;

        const wrap = document.createElement("div");
        wrap.id = CHANGE_PASSWORD_ID;
        wrap.className = "app-dialog-backdrop hidden";
        wrap.innerHTML = `
  <div class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="changePasswordTitle">
    <h3 class="title" id="changePasswordTitle">Change password</h3>

    <div class="field">
      <label for="cpOldPassword">Current password</label>
      <input id="cpOldPassword" type="password" autocomplete="current-password" />
    </div>

    <div class="field">
      <label for="cpNewPassword">New password</label>
      <input id="cpNewPassword" type="password" autocomplete="new-password" />
    </div>

    <div class="field">
      <label for="cpConfirmPassword">Confirm new password</label>
      <input id="cpConfirmPassword" type="password" autocomplete="new-password" />
    </div>

    <div class="actions">
      <button type="button" class="btn btn-secondary" id="cpCancelBtn">Cancel</button>
      <button type="button" class="btn btn-primary" id="cpSaveBtn">Save</button>
    </div>
  </div>
`;
        document.body.appendChild(wrap);

        function close() {
            wrap.classList.add("hidden");
        }

        wrap.querySelector("#cpCancelBtn")?.addEventListener("click", close);
        wrap.addEventListener("click", (e) => {
            if (e.target === wrap) close();
        });

        wrap.querySelector("#cpSaveBtn")?.addEventListener("click", async () => {
            const token = (localStorage.getItem("token") || "").trim();
            if (!token) {
                window.location.href = "/ZClassScheduler/html/Login.html";
                return;
            }

            const oldPassword = String(wrap.querySelector("#cpOldPassword")?.value || "");
            const newPassword = String(wrap.querySelector("#cpNewPassword")?.value || "");
            const confirm = String(wrap.querySelector("#cpConfirmPassword")?.value || "");

            if (!oldPassword || !newPassword) {
                window.appAlert?.("Please fill in your current password and a new password.");
                return;
            }
            if (newPassword.length < 6) {
                window.appAlert?.("New password must be at least 6 characters.");
                return;
            }
            if (newPassword !== confirm) {
                window.appAlert?.("New password and confirmation do not match.");
                return;
            }

            const btn = wrap.querySelector("#cpSaveBtn");
            if (btn) btn.disabled = true;

            try {
                const res = await fetch("/api/auth/change-password", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({ oldPassword, newPassword }),
                });

                if (!res.ok) {
                    let msg = "Unable to change password.";
                    try {
                        const data = await res.json();
                        if (data?.message) msg = data.message;
                    } catch (_) {
                        // ignore
                    }
                    window.appAlert?.(msg);
                    return;
                }

                window.appAlert?.("Password updated.");
                close();
            } catch (err) {
                console.error(err);
                window.appAlert?.("Unable to change password right now.");
            } finally {
                if (btn) btn.disabled = false;
            }
        });
    }

    window.showChangePasswordModal = function () {
        ensureChangePasswordModal();
        const wrap = document.getElementById(CHANGE_PASSWORD_ID);
        if (!wrap) return;

        const oldEl = wrap.querySelector("#cpOldPassword");
        const newEl = wrap.querySelector("#cpNewPassword");
        const confEl = wrap.querySelector("#cpConfirmPassword");
        if (oldEl) oldEl.value = "";
        if (newEl) newEl.value = "";
        if (confEl) confEl.value = "";

        wrap.classList.remove("hidden");
        oldEl?.focus?.();
    };

    // =========================
    // TOOLTIP (GLOBAL, hover/focus/touch)
    // =========================
    const TOOLTIP_ID = "appTooltip";
    let __tooltipActiveTarget__ = null;
    let __tooltipHideTimer__ = null;
    let __tooltipTouchTimer__ = null;

    function ensureTooltip() {
        if (document.getElementById(TOOLTIP_ID)) return;
        const el = document.createElement("div");
        el.id = TOOLTIP_ID;
        el.className = "app-tooltip hidden";
        el.setAttribute("role", "tooltip");
        document.body.appendChild(el);
    }

    function positionTooltip(el, anchorRect) {
        const pad = 8;
        const gap = 10;

        // Measure after content is set (el is visible but may be transparent).
        const tipRect = el.getBoundingClientRect();

        let left = anchorRect.left + (anchorRect.width / 2) - (tipRect.width / 2);
        left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));

        // Prefer above; if not enough space, put below.
        let top = anchorRect.top - tipRect.height - gap;
        if (top < pad) top = anchorRect.bottom + gap;
        top = Math.max(pad, Math.min(top, window.innerHeight - tipRect.height - pad));

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    function hideTooltip(immediate = false) {
        const el = document.getElementById(TOOLTIP_ID);
        if (!el) return;

        if (__tooltipHideTimer__) clearTimeout(__tooltipHideTimer__);
        __tooltipHideTimer__ = null;

        el.classList.remove("show");
        __tooltipActiveTarget__ = null;

        const finish = () => el.classList.add("hidden");
        if (immediate) return finish();
        __tooltipHideTimer__ = setTimeout(finish, 140);
    }

    function showTooltipFor(target) {
        if (!target) return;
        const msg = String(target.getAttribute("data-tooltip") || "").trim();
        if (!msg) return;

        ensureTooltip();
        const el = document.getElementById(TOOLTIP_ID);
        if (!el) return;

        if (__tooltipHideTimer__) clearTimeout(__tooltipHideTimer__);
        __tooltipHideTimer__ = null;

        __tooltipActiveTarget__ = target;
        el.textContent = msg;
        el.classList.remove("hidden");

        // Position after it becomes renderable.
        requestAnimationFrame(() => {
            if (!__tooltipActiveTarget__) return;
            positionTooltip(el, target.getBoundingClientRect());
            el.classList.add("show");
        });
    }

    function tooltipTargetFromEvent(e) {
        const t = e?.target;
        return t?.closest ? t.closest("[data-tooltip]") : null;
    }

    // Mouse hover (desktop)
    document.addEventListener("pointerover", (e) => {
        if (e.pointerType !== "mouse") return;
        const t = tooltipTargetFromEvent(e);
        if (!t) return;
        showTooltipFor(t);
    });

    document.addEventListener("pointerout", (e) => {
        if (e.pointerType !== "mouse") return;
        const from = tooltipTargetFromEvent(e);
        const to = e?.relatedTarget?.closest ? e.relatedTarget.closest("[data-tooltip]") : null;
        if (from && from !== to) hideTooltip();
    });

    // Keyboard accessibility
    document.addEventListener("focusin", (e) => {
        const t = tooltipTargetFromEvent(e);
        if (t) showTooltipFor(t);
    });

    document.addEventListener("focusout", (e) => {
        const t = tooltipTargetFromEvent(e);
        if (t) hideTooltip();
    });

    // Touch: show briefly, don't block the click.
    document.addEventListener("pointerdown", (e) => {
        if (e.pointerType !== "touch") return;
        const t = tooltipTargetFromEvent(e);
        if (!t) return;

        showTooltipFor(t);
        if (__tooltipTouchTimer__) clearTimeout(__tooltipTouchTimer__);
        __tooltipTouchTimer__ = setTimeout(() => hideTooltip(), 1400);
    });

    // Keep positioned / hide when viewport changes.
    const onViewport = () => {
        const el = document.getElementById(TOOLTIP_ID);
        if (!el || el.classList.contains("hidden") || !__tooltipActiveTarget__) return;
        positionTooltip(el, __tooltipActiveTarget__.getBoundingClientRect());
    };
    window.addEventListener("resize", onViewport);
    document.addEventListener("scroll", onViewport, true);

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
        // "Pencil on paper" (manual create / compose)
        compose: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 11h10v2H7v-2zm0 4h7v2H7v-2z"/><path d="M21.7 10.3a1 1 0 0 0-1.4 0l-6.9 6.9-.4 2.8 2.8-.4 6.9-6.9a1 1 0 0 0 0-1.4l-1-1z"/></svg>`,
        delete: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9zm-1 14h12a2 2 0 0 0 2-2V7H4v14a2 2 0 0 0 2 2z"/></svg>`,
        add: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v14h-2V5zm-6 6h14v2H5v-2z"/></svg>`,
        refresh: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17.65 6.35A7.95 7.95 0 0 0 12 4V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 13.65-6.65z"/></svg>`,
        upload: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zM12 2 6.5 7.5l1.4 1.4L11 5.8V16h2V5.8l3.1 3.1 1.4-1.4L12 2z"/></svg>`,
        save: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7l-4-4zM12 19a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM6 5h9v4H6V5z"/></svg>`,
        // Key / reset password
        key: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 14a4.5 4.5 0 1 1 4.4-5.5H22v3h-2v2h-2v2h-3.6A4.5 4.5 0 0 1 7.5 14zm0-2.5a2 2 0 1 0 0-4a2 2 0 0 0 0 4z"/></svg>`,
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
        if (t === "manual create") return "compose";
        if (t === "save" || t === "create") return "save";
        if (t === "reset password" || t === "reset") return "key";
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
            if (!el.getAttribute("data-tooltip")) el.setAttribute("data-tooltip", label);

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

