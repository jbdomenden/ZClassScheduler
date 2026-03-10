/* =========================================================
   MANAGE TEACHER (DB-backed)
   - Auth is only used in login (per requirement)
========================================================= */

const ALLOWED_DEPARTMENTS = [
    "ICT", "THM", "BM", "GE",
    "ME", "MT", "NA", "HS",
    "STAFF"
];

const API_BASE = "/api/settings/teachers";
const API_BLOCKS = "/api/settings/teacher-blocks";
const API_ME = "/api/auth/me";
const API_RESET_PASSWORD = (id) => `/api/settings/teachers/${encodeURIComponent(id)}/reset-password`;

let teacherDB = [];

const token = localStorage.getItem("token");
function authHeaders() {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

let sortKey = "department";
let sortDir = "asc";

const CURRENT_USER = {
    role: "TEACHER", // SUPER_ADMIN | ADMIN | TEACHER
    email: "",
    depts: new Set(),
};

function normalizeRole(roleRaw) {
    const r = String(roleRaw || "").trim().toLowerCase();
    if (r === "super_admin" || r === "superadmin" || r === "super admin") return "SUPER_ADMIN";
    if (r === "admin") return "ADMIN";
    if (r === "checker") return "CHECKER";
    if (r === "non_teaching" || r === "non-teaching" || r === "non teaching" || r === "nonteaching") return "NON_TEACHING";
    if (r === "teacher") return "TEACHER";
    return String(roleRaw || "").trim().toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_") || "TEACHER";
}

function normDept(v) {
    return String(v || "").trim().toUpperCase();
}

function parseDeptSet(raw) {
    return new Set(
        String(raw || "")
            .split(/[;,|]/g)
            .map(s => normDept(s))
            .filter(Boolean)
    );
}

function roleRankOf(roleRaw) {
    const r = normalizeRole(roleRaw);
    if (r === "SUPER_ADMIN") return 3;
    if (r === "ADMIN") return 2;
    return 1;
}

function isStaffAdmin() {
    return CURRENT_USER.role === "ADMIN" && CURRENT_USER.depts && CURRENT_USER.depts.has("STAFF");
}

function canManageUser(targetTeacher) {
    if (!targetTeacher) return false;
    if (CURRENT_USER.role === "SUPER_ADMIN") return true;
    if (CURRENT_USER.role !== "ADMIN") return false;

    const tDepts = parseDeptSet(targetTeacher?.department);
    if (!tDepts.size) return false;
    let sameDept = false;
    for (const d of tDepts) {
        if (CURRENT_USER.depts.has(d)) { sameDept = true; break; }
    }
    if (!sameDept) return false;

    const tr = normalizeRole(targetTeacher?.role);
    if (roleRankOf(tr) >= roleRankOf("ADMIN")) return false;

    // Requested restriction:
    // - Admin without STAFF dept: manage TEACHER only
    // - Admin with STAFF dept: manage CHECKER/NON_TEACHING only
    if (isStaffAdmin()) return tr === "CHECKER" || tr === "NON_TEACHING";
    return tr === "TEACHER";
}

function allowedRolesForCurrentUser() {
    if (CURRENT_USER.role === "SUPER_ADMIN") return ["TEACHER", "ADMIN", "CHECKER", "NON_TEACHING", "SUPER_ADMIN"];
    if (CURRENT_USER.role === "ADMIN") {
        if (isStaffAdmin()) return ["CHECKER", "NON_TEACHING"];
        return ["TEACHER"];
    }
    return [];
}

function applyRoleOptionsFilter(allowed, keepValue = true) {
    if (!role) return;
    const allowedSet = new Set((allowed || []).map(normalizeRole));
    const current = normalizeRole(role.value);

    [...role.options].forEach((o) => {
        // keep placeholder option (value="")
        if (!o.value) return;
        const v = normalizeRole(o.value);
        o.style.display = allowedSet.has(v) ? "" : "none";
    });

    if (!keepValue) {
        const first = [...role.options].find((o) => o.value && o.style.display !== "none");
        role.value = first ? first.value : "";
        return;
    }

    if (role.value && !allowedSet.has(current)) {
        const first = [...role.options].find((o) => o.value && o.style.display !== "none");
        role.value = first ? first.value : "";
    }
}

function applyDepartmentOptionsFilter() {
    if (!departmentSelect) return;

    // Default: show all
    let allowed = null;
    if (CURRENT_USER.role === "ADMIN") {
        if (isStaffAdmin()) {
            allowed = new Set(["STAFF"]);
        } else {
            // Admins can only manage within their own depts; hide STAFF unless explicitly in depts.
            allowed = new Set([...CURRENT_USER.depts].filter(Boolean));
        }
    }

    [...departmentSelect.options].forEach((o) => {
        if (!o.value) return; // placeholder
        const d = normDept(o.value);
        if (!allowed) {
            o.style.display = "";
            return;
        }
        o.style.display = allowed.has(d) ? "" : "none";
    });

    // If current selection is hidden/invalid, pick first visible option.
    const cur = normDept(departmentSelect.value);
    if (allowed && departmentSelect.value && !allowed.has(cur)) {
        const first = [...departmentSelect.options].find((o) => o.value && o.style.display !== "none");
        departmentSelect.value = first ? first.value : "";
    }
}

function canShowAdminTimeForTeacher(targetTeacher) {
    if (CURRENT_USER.role === "SUPER_ADMIN") return true;
    if (CURRENT_USER.role === "ADMIN") {
        const tDepts = parseDeptSet(targetTeacher?.department);
        if (!tDepts.size) return false;
        for (const d of tDepts) {
            if (CURRENT_USER.depts.has(d)) return true;
        }
        return false;
    }
    return false;
}

async function loadCurrentUserContext() {
    if (!token) return;

    const res = await fetch(API_ME, { headers: { ...authHeaders(), Accept: "application/json" } });
    if (res.status === 401 || res.status === 403) {
        window.location.href = "/ZClassScheduler/html/Login.html";
        return;
    }
    if (!res.ok) return;

    const me = await res.json().catch(() => null);
    CURRENT_USER.role = normalizeRole(me?.role);
    CURRENT_USER.email = String(me?.email || "").trim().toLowerCase();

    // Only SUPER_ADMIN can assign Super Admin.
    if (CURRENT_USER.role === "SUPER_ADMIN") {
        const select = document.getElementById("role");
        if (select) {
            const has = [...select.options].some((o) => String(o.value) === "SUPER_ADMIN");
            if (!has) {
                const option = document.createElement("option");
                option.value = "SUPER_ADMIN";
                option.textContent = "Super Admin";
                select.appendChild(option);
            }
        }
    }
}

/* ================= DOM ================= */

const tableBody = document.querySelector("#teacherTable tbody");
const modal = document.getElementById("teacherModal");
const form = document.getElementById("teacherForm");

const addBtn = document.getElementById("addTeacherBtn");
const cancelBtn = document.getElementById("cancelBtn");

const empFn = document.getElementById("empFn");
const empLn = document.getElementById("empLn");
const departmentSelect = document.getElementById("type");
const deptMultiWrap = document.getElementById("deptMultiWrap");
const deptMulti = document.getElementById("deptMulti");
const email = document.getElementById("email");
const role = document.getElementById("role");
const status = document.getElementById("status");
const resetPasswordBtn = document.getElementById("resetPasswordBtn");

// Admin Time modal
const adminTimeModal = document.getElementById("adminTimeModal");
const adminTimeCloseBtn = document.getElementById("adminTimeCloseBtn");
const adminTimeTeacherLabel = document.getElementById("adminTimeTeacherLabel");
const adminTeacherId = document.getElementById("adminTeacherId");

const adminSelectionBar = document.getElementById("adminSelectionBar");
const adminSelDay = document.getElementById("adminSelDay");
const adminSelStart = document.getElementById("adminSelStart");
const adminSelEnd = document.getElementById("adminSelEnd");
const adminSelType = document.getElementById("adminSelType");
const adminSelSaveBtn = document.getElementById("adminSelSaveBtn");
const adminSelCancelBtn = document.getElementById("adminSelCancelBtn");

const adminTimeScheduleGrid = document.getElementById("adminTimeScheduleGrid");

let searchInput = null;
let editingId = null;

/* ================= API ================= */

async function fetchTeachers() {
    if (!token) {
        window.location.href = "/ZClassScheduler/html/Login.html";
        return;
    }

    const res = await fetch(API_BASE, { headers: { ...authHeaders() } });
    if (!res.ok) throw new Error("Failed to load teachers");
    const data = await res.json();

    teacherDB = (data || []).map(t => {
        return {
            id: t.id,
            empId: t.empId || "",
            firstName: t.firstName,
            lastName: t.lastName,
            department: t.department,
            email: t.email,
            role: t.role || "TEACHER",
            status: t.status || "Active",
        };
    });

    // Resolve current user's department (for Admin Time visibility).
    // If Super Admin, dept is not needed.
    if (CURRENT_USER.email) {
        const meTeacher = teacherDB.find((x) => String(x.email || "").trim().toLowerCase() === CURRENT_USER.email);
        CURRENT_USER.depts = meTeacher ? parseDeptSet(meTeacher.department) : new Set();
    }

    // Default: department, then lastname
    sortKey = "department";
    sortDir = "asc";
    updateSortUI();

    renderTeachers();

    // Filter role options now that CURRENT_USER.depts has been resolved from teacherDB.
    applyRoleOptionsFilter(allowedRolesForCurrentUser(), true);
}

async function apiCreateTeacher(payload) {
    const res = await fetch(API_BASE, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (res.status === 409) {
        const msg = await safeJson(res);
        throw new Error(msg?.message || "Duplicate teacher.");
    }
    if (!res.ok) throw new Error("Failed to create teacher");
    return res.json();
}

async function apiUpdateTeacher(id, payload) {
    const res = await fetch(`${API_BASE}/${id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (res.status === 409) {
        const msg = await safeJson(res);
        throw new Error(msg?.message || "Duplicate teacher.");
    }
    if (!res.ok) throw new Error("Failed to update teacher");
}

async function apiDeleteTeacher(id) {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
    if (!res.ok) throw new Error("Failed to delete teacher");
}

async function apiResetPassword(id) {
    const res = await fetch(API_RESET_PASSWORD(id), {
        method: "POST",
        headers: { ...authHeaders(), Accept: "application/json" },
    });

    const txt = await res.text();
    if (!res.ok) {
        try {
            const j = txt ? JSON.parse(txt) : null;
            throw new Error(j?.message || j?.error || `${res.status} ${res.statusText}`);
        } catch {
            throw new Error(txt || `${res.status} ${res.statusText}`);
        }
    }

    try { return txt ? JSON.parse(txt) : null; } catch { return null; }
}

async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}

function pad2(n) { return String(n).padStart(2, "0"); }
function buildTimes(startHH = 7, endHH = 21) {
    const out = [];
    for (let h = startHH; h <= endHH; h++) {
        out.push(`${pad2(h)}:00`);
        if (h !== endHH) out.push(`${pad2(h)}:30`);
    }
    return out;
}

function hhmmToMin(v) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(v || "").trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

async function apiListTeacherBlocks(teacherId) {
    const res = await fetch(`${API_BLOCKS}?teacherId=${encodeURIComponent(teacherId)}`, { headers: { ...authHeaders(), Accept: "application/json" } });
    if (!res.ok) throw new Error("Failed to load admin time blocks");
    return res.json();
}

async function apiCreateTeacherBlock(payload) {
    const res = await fetch(API_BLOCKS, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    const txt = await res.text();
    if (!res.ok) {
        try {
            const j = txt ? JSON.parse(txt) : null;
            throw new Error(j?.message || j?.error || `${res.status} ${res.statusText}`);
        } catch {
            throw new Error(txt || `${res.status} ${res.statusText}`);
        }
    }
}

async function apiDeleteTeacherBlock(id) {
    const res = await fetch(`${API_BLOCKS}/${encodeURIComponent(id)}`, { method: "DELETE", headers: { ...authHeaders() } });
    if (res.status === 204) return;
    if (!res.ok) throw new Error("Failed to delete admin time block");
}

function teacherDisplay(t) {
    if (!t) return "";
    const dept = (t.department || "").trim();
    const fn = (t.firstName || "").trim();
    const ln = (t.lastName || "").trim();
    const email = (t.email || "").trim();
    return `${dept} ${fn} ${ln}`.replace(/\s+/g, " ").trim() + (email ? ` (${email})` : "");
}

// ---- Department UI (ADMIN multi-department) ----
let __adminDeptSet__ = new Set();

function syncDeptMultiUi() {
    if (!deptMulti) return;
    deptMulti.querySelectorAll("input[type='checkbox'][data-dept]").forEach((cb) => {
        const d = normDept(cb.getAttribute("data-dept"));
        cb.checked = __adminDeptSet__.has(d);
    });
}

function setAdminDeptSetFromString(raw) {
    __adminDeptSet__ = parseDeptSet(raw);
    syncDeptMultiUi();
}

function getAdminDeptString() {
    return [...__adminDeptSet__].sort().join(",");
}

function buildDeptCheckboxes() {
    if (!deptMulti) return;
    if (deptMulti.dataset.built === "1") return;
    deptMulti.dataset.built = "1";

    deptMulti.innerHTML = ALLOWED_DEPARTMENTS.map((d) => `
      <label style="display:inline-flex;align-items:center;gap:6px;">
        <input type="checkbox" data-dept="${escapeHtml(d)}" />
        <span>${escapeHtml(d)}</span>
      </label>
    `).join("");

    deptMulti.addEventListener("change", (e) => {
        const cb = e.target.closest("input[type='checkbox'][data-dept]");
        if (!cb) return;
        const d = normDept(cb.getAttribute("data-dept"));
        if (!d) return;
        if (cb.checked) __adminDeptSet__.add(d);
        else __adminDeptSet__.delete(d);
    });
}

function syncDeptUiForRole(roleValue) {
    const r = normalizeRole(roleValue);
    const isAdmin = (r === "ADMIN");

    if (deptMultiWrap) deptMultiWrap.classList.toggle("is-hidden", !isAdmin);
    if (departmentSelect) departmentSelect.classList.toggle("is-hidden", isAdmin);

    if (departmentSelect) departmentSelect.required = !isAdmin;

    // For admin, ensure checkboxes exist.
    if (isAdmin) buildDeptCheckboxes();
}

// ---- Admin Time Grid ----
const GRID = {
    startMin: 7 * 60,
    endMin: 21 * 60,
    step: 30,
    days: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
};

const DAY_FULL = {
    MON: "MONDAY",
    TUE: "TUESDAY",
    WED: "WEDNESDAY",
    THU: "THURSDAY",
    FRI: "FRIDAY",
    SAT: "SATURDAY",
};

function toShortDay(dayOfWeek) {
    const d = String(dayOfWeek || "").trim().toUpperCase();
    if (!d) return "";
    if (d.startsWith("MON")) return "MON";
    if (d.startsWith("TUE")) return "TUE";
    if (d.startsWith("WED")) return "WED";
    if (d.startsWith("THU")) return "THU";
    if (d.startsWith("FRI")) return "FRI";
    if (d.startsWith("SAT")) return "SAT";
    return "";
}

function normalizeHHMM(value) {
    if (!value) return "";
    const s = String(value).trim();
    // "HH:mm:ss" -> "HH:mm"
    const m1 = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(s);
    if (m1) return `${pad2(m1[1])}:${m1[2]}`;
    const m2 = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (m2) return `${pad2(m2[1])}:${m2[2]}`;
    return "";
}

function buildGridRows(tbody) {
    if (!tbody) return;
    tbody.innerHTML = "";

    for (let t = GRID.startMin; t < GRID.endMin; t += GRID.step) {
        const tr = document.createElement("tr");

        const startTd = document.createElement("td");
        startTd.className = "time-col";
        startTd.textContent = minutesToLabel(t);
        tr.appendChild(startTd);

        const endTd = document.createElement("td");
        endTd.className = "time-col";
        endTd.textContent = minutesToLabel(t + GRID.step);
        tr.appendChild(endTd);

        GRID.days.forEach((day) => {
            const td = document.createElement("td");
            td.dataset.day = DAY_FULL[day] || day;
            td.dataset.start = minutesToHHMM(t);
            td.dataset.end = minutesToHHMM(t + GRID.step);
            td.dataset.occupied = "0";
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    }
}

function minutesToLabel(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    const ap = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    return `${hr}:${pad2(m)} ${ap}`;
}

function minutesToHHMM(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${pad2(h)}:${pad2(m)}`;
}

function toMinHHMM(hhmm) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function markConflictsWithRemarks(entries) {
    const enriched = (entries || [])
        .map((e, idx) => ({
            idx,
            day: String(e.dayOfWeek || "").trim(),
            start: String(e.start || "").trim(),
            end: String(e.end || "").trim(),
            label: String(e.label || "").trim(),
            kind: String(e.kind || "").trim(),
            sm: toMinHHMM(e.start),
            em: toMinHHMM(e.end),
        }))
        .filter((e) => e.day && e.sm != null && e.em != null && e.em > e.sm);

    const conflictIdx = new Set();
    const remarks = new Map();

    function addRemark(idx, msg) {
        if (!remarks.has(idx)) remarks.set(idx, new Set());
        remarks.get(idx).add(msg);
    }

    const byDay = new Map();
    enriched.forEach((e) => {
        if (!byDay.has(e.day)) byDay.set(e.day, []);
        byDay.get(e.day).push(e);
    });

    byDay.forEach((list, day) => {
        list.sort((a, b) => a.sm - b.sm);
        for (let i = 0; i < list.length; i++) {
            const a = list[i];
            for (let j = i + 1; j < list.length && list[j].sm < a.em; j++) {
                const b = list[j];
                if (a.sm < b.em && b.sm < a.em) {
                    conflictIdx.add(a.idx);
                    conflictIdx.add(b.idx);
                    addRemark(a.idx, `Conflict (${day}): overlaps ${b.label} ${b.start}-${b.end}`);
                    addRemark(b.idx, `Conflict (${day}): overlaps ${a.label} ${a.start}-${a.end}`);
                }
            }
        }
    });

    return (entries || []).map((e, idx) => ({
        ...e,
        conflict: conflictIdx.has(idx),
        conflictRemarks: remarks.has(idx) ? [...remarks.get(idx)].join("\n") : "",
    }));
}

function renderGridEntries(tbody, entries) {
    if (!tbody) return;
    const rows = tbody.querySelectorAll("tr");

    (entries || []).forEach((entry) => {
        const dayShort = toShortDay(entry.dayOfWeek);
        const dayIndex = GRID.days.indexOf(dayShort);
        const sm = toMinHHMM(entry.start);
        const em = toMinHHMM(entry.end);
        if (dayIndex < 0 || sm == null || em == null) return;
        if (sm < GRID.startMin || em > GRID.endMin) return;
        if (sm % GRID.step !== 0 || em % GRID.step !== 0) return;

        const span = (em - sm) / GRID.step;
        const rowIndex = (sm - GRID.startMin) / GRID.step;
        if (rowIndex < 0 || rowIndex >= rows.length) return;

        const row = rows[rowIndex];
        const cell = row.children[dayIndex + 2];
        if (!cell) return;

        cell.rowSpan = span;
        cell.dataset.occupied = "1";
        cell.className = entry.typeClass || "";

        if (entry.conflict) cell.classList.add("conflict-cell");
        if (entry.conflictRemarks) cell.title = String(entry.conflictRemarks);

        cell.innerHTML = entry.html || "";

        for (let i = 1; i < span; i++) {
            const nextRow = rows[rowIndex + i];
            if (!nextRow) continue;
            const nextCell = nextRow.children[dayIndex + 2];
            if (nextCell) nextCell.remove();
        }
    });
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, {
        ...options,
        headers: {
            ...authHeaders(),
            Accept: "application/json",
            ...(options.headers || {}),
        },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    return await res.json();
}

async function fetchAllBlocks(urls) {
    const results = await Promise.all((urls || []).map((u) => fetchJson(u).catch(() => [])));
    return results.flat();
}

function blockSectionLabel(block) {
    return String(block?.sectionCode || block?.section || "").trim();
}

async function loadTeacherScheduleEntries(teacherId) {
    const API = {
        rooms: "/api/settings/rooms",
        blocks: [
            "/api/scheduler/jhs/blocks",
            "/api/scheduler/shs/blocks",
            "/api/scheduler/tertiary/blocks",
            "/api/scheduler/namei/blocks",
        ],
    };

    const [roomsRaw, blocksRaw] = await Promise.all([
        fetchJson(API.rooms).catch(() => []),
        fetchAllBlocks(API.blocks).catch(() => []),
    ]);

    const roomById = new Map((roomsRaw || []).map((r) => [String(r.id), String(r.code || r.roomCode || r.name || "").trim()]));

    const out = [];
    (blocksRaw || []).forEach((block) => {
        const section = blockSectionLabel(block) || "\u2014";
        (block.rows || []).forEach((row) => {
            if (!row?.teacherId) return;
            if (String(row.teacherId) !== String(teacherId)) return;

            const dayFull = String(row.dayOfWeek || "").trim().toUpperCase();
            const start = normalizeHHMM(row.timeStart);
            const end = normalizeHHMM(row.timeEnd);
            if (!dayFull || !start || !end) return;

            const room = row.roomId ? (roomById.get(String(row.roomId)) || "\u2014") : "\u2014";
            const code = String(row.subjectCode || "\u2014");
            const name = String(row.subjectName || "\u2014");

            out.push({
                kind: "class",
                dayOfWeek: dayFull,
                start,
                end,
                typeClass: row.isElective ? "Elective" : "Regular",
                label: `${code} ${section}`.trim(),
                html: `
                  <strong>${escapeHtml(code)}</strong><br>
                  ${escapeHtml(name)}<br>
                  <strong>${escapeHtml(section)}</strong><br>
                  ${escapeHtml(room)}
                `,
            });
        });
    });

    return out;
}

async function loadTeacherBlockEntries(teacherId) {
    const blocks = await apiListTeacherBlocks(teacherId).catch(() => []);
    return (blocks || []).map((b) => {
        const dayFull = String(b.dayOfWeek || "").trim().toUpperCase();
        const start = normalizeHHMM(b.timeStart);
        const end = normalizeHHMM(b.timeEnd);
        const type = String(b.type || "ADMIN").trim().toUpperCase();
        const typeClass = (type === "BREAK") ? "break" : (type === "REST_DAY") ? "restday" : "admin";
        const label = (type === "REST_DAY") ? "REST DAY" : `${type} TIME`;

        return {
            kind: "block",
            blockId: String(b.id),
            dayOfWeek: dayFull,
            start,
            end,
            typeClass,
            label,
            html: `
              <strong>${escapeHtml(type)}</strong><br>
              <span class="muted">${escapeHtml(start)} - ${escapeHtml(end)}</span><br>
              <button type="button" class="btn btn-delete" data-action="delete-admin-block" data-block-id="${escapeHtml(b.id)}" style="margin-top:6px;padding:4px 8px;font-size:11px;">Delete</button>
            `,
        };
    });
}

function selectionType() {
    return String(adminSelType?.value || "ADMIN").trim().toUpperCase();
}

function validEndTimesForStart(startHHMM, type) {
    const sm = toMinHHMM(startHHMM);
    if (sm == null) return [];

    const t = String(type || "ADMIN").trim().toUpperCase();
    if (t === "REST_DAY") return [minutesToHHMM(GRID.endMin)];
    if (t === "BREAK") {
        const end = sm + 60;
        return (end <= GRID.endMin) ? [minutesToHHMM(end)] : [];
    }

    // ADMIN: any length (30-min aligned) up to end-of-day.
    const out = [];
    for (let m = sm + GRID.step; m <= GRID.endMin; m += GRID.step) out.push(minutesToHHMM(m));
    return out;
}

function applySelectionTypeRules() {
    if (!adminSelStart || !adminSelEnd) return;

    const t = selectionType();

    if (t === "REST_DAY") {
        adminSelStart.value = minutesToHHMM(GRID.startMin);
        adminSelEnd.innerHTML = `<option value="${minutesToHHMM(GRID.endMin)}">${minutesToHHMM(GRID.endMin)}</option>`;
        adminSelEnd.value = minutesToHHMM(GRID.endMin);
        adminSelEnd.disabled = true;
        return;
    }

    const startHHMM = String(adminSelStart.value || "").trim();
    const ends = validEndTimesForStart(startHHMM, t);
    adminSelEnd.innerHTML = ends.map((x) => `<option value="${x}">${x}</option>`).join("");
    adminSelEnd.value = ends[0] || "";

    // BREAK: fixed 1 hour (single option). ADMIN: flexible.
    adminSelEnd.disabled = (t === "BREAK");
}

function showSelection({ dayFull, startHHMM }) {
    if (!adminSelectionBar || !adminSelDay || !adminSelStart || !adminSelEnd) return;
    adminSelDay.value = dayFull;
    adminSelStart.value = startHHMM;

    applySelectionTypeRules();
    adminSelectionBar.classList.remove("is-hidden");
}

function hideSelection() {
    adminSelectionBar?.classList.add("is-hidden");
}

let __adminGridTeacherId__ = null;
let __adminGridEntries__ = [];

async function renderAdminTimeGridForTeacher(teacherId) {
    if (!adminTimeScheduleGrid) return;
    buildGridRows(adminTimeScheduleGrid);

    const classEntries = await loadTeacherScheduleEntries(teacherId);
    const blockEntries = await loadTeacherBlockEntries(teacherId);

    const merged = markConflictsWithRemarks([...(classEntries || []), ...(blockEntries || [])]);
    __adminGridEntries__ = merged;

    renderGridEntries(adminTimeScheduleGrid, merged);
}

async function openAdminTimeModal(teacherId) {
    const t = teacherDB.find(x => String(x.id) === String(teacherId));
    if (!t) {
        appAlert("User not found.");
        return;
    }

    if (!canShowAdminTimeForTeacher(t)) {
        appAlert("You are not allowed to manage Admin Time for this user.");
        return;
    }

    if (adminTeacherId) adminTeacherId.value = String(t.id);
    if (adminTimeTeacherLabel) adminTimeTeacherLabel.textContent = teacherDisplay(t);

    adminTimeModal?.classList.remove("hidden");
    hideSelection();
    __adminGridTeacherId__ = String(t.id);
    await renderAdminTimeGridForTeacher(String(t.id));
}

/* ================= SEARCH LOAD ================= */

async function loadSearchComponent() {
    const response = await fetch("/ZClassScheduler/html/GlobalSearch.html");
    const html = await response.text();
    document.getElementById("searchContainer").innerHTML = html;

    searchInput = document.querySelector("#searchInput");

    if (searchInput) {
        searchInput.addEventListener("input", handleSearch);
    }

    const clearBtn = document.querySelector("#searchContainer .clear-btn");
    if (clearBtn && searchInput) {
        const sync = () => (clearBtn.style.display = searchInput.value ? "block" : "none");
        searchInput.addEventListener("input", sync);
        clearBtn.addEventListener("click", () => {
            searchInput.value = "";
            sync();
            handleSearch();
        });
        sync();
    }
}

/* ================= RENDER ================= */

function renderTeachers(data = teacherDB) {
    tableBody.innerHTML = "";

    const sorted = applySort(data);

    if (!sorted.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7">No users found.</td>
            </tr>
        `;
        return;
    }

    sorted.forEach(teacher => {
        const row = document.createElement("tr");
        row.dataset.id = teacher.id;
        const showAdminTime = canShowAdminTimeForTeacher(teacher);
        const showManage = canManageUser(teacher);

        row.innerHTML = `
            <td>${escapeHtml(teacher.firstName)}</td>
            <td>${escapeHtml(teacher.lastName)}</td>
            <td>${escapeHtml(teacher.department)}</td>
            <td>${escapeHtml(teacher.email)}</td>
            <td>${escapeHtml(teacher.role)}</td>
            <td class="${teacher.status === 'Active' ? 'status-active' : 'status-inactive'}">
                ${escapeHtml(teacher.status)}
            </td>
            <td>
                ${showManage ? `<button class="btn btn-edit" type="button" data-action="edit">Edit</button>` : ``}
                ${showAdminTime ? `<button class="btn btn-secondary" type="button" data-action="adminTime" data-tooltip="Manage this user's Admin Time">Admin Time</button>` : ``}
                ${showManage ? `<button class="btn btn-delete" type="button" data-action="delete">Delete</button>` : ``}
            </td>
        `;

        tableBody.appendChild(row);
    });
}

function normalizeSortVal(v) {
    if (v == null) return "";
    if (typeof v === "number") return v;
    const s = String(v).trim();
    const n = Number(s);
    if (!Number.isNaN(n) && s !== "") return n;
    return s.toLowerCase();
}

function compareTeachers(a, b) {
    const dir = sortDir === "desc" ? -1 : 1;
    const av = normalizeSortVal(a?.[sortKey]);
    const bv = normalizeSortVal(b?.[sortKey]);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;

    // Default tie-breakers: department -> lastName -> firstName
    const d = normalizeSortVal(a?.department).localeCompare(normalizeSortVal(b?.department));
    if (d !== 0) return d;
    const ln = normalizeSortVal(a?.lastName).localeCompare(normalizeSortVal(b?.lastName));
    if (ln !== 0) return ln;
    return normalizeSortVal(a?.firstName).localeCompare(normalizeSortVal(b?.firstName));
}

function applySort(list) {
    return (list || []).slice().sort(compareTeachers);
}

function updateSortUI() {
    const table = document.getElementById("teacherTable");
    if (!table) return;
    table.querySelectorAll("thead th[data-key]").forEach(th => {
        th.classList.remove("sorted", "asc", "desc");
        if (String(th.dataset.key) === String(sortKey)) {
            th.classList.add("sorted");
            th.classList.add(sortDir === "asc" ? "asc" : "desc");
        }
    });
}

function initHeaderSort() {
    const table = document.getElementById("teacherTable");
    if (!table) return;
    if (table.dataset.sortBound) return;
    table.dataset.sortBound = "1";

    table.querySelector("thead")?.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-key]");
        if (!th) return;
        const key = String(th.dataset.key || "");
        if (!key) return;

        if (sortKey === key) sortDir = sortDir === "asc" ? "desc" : "asc";
        else {
            sortKey = key;
            sortDir = "asc";
        }

        updateSortUI();
        handleSearch();
    });

    // Default: department then lastname
    sortKey = "department";
    sortDir = "asc";
    updateSortUI();
}

/* ================= SEARCH ================= */

function handleSearch() {
    const value = (searchInput?.value || "").toLowerCase().trim();

    const filtered = teacherDB.filter(t =>
        (t.firstName || "").toLowerCase().includes(value) ||
        (t.lastName || "").toLowerCase().includes(value) ||
        (t.department || "").toLowerCase().includes(value) ||
        (t.email || "").toLowerCase().includes(value) ||
        (t.role || "").toLowerCase().includes(value) ||
        (t.status || "").toLowerCase().includes(value)
    );

    renderTeachers(filtered);
}

/* ================= SAVE ================= */

form.addEventListener("submit", (e) => {
    e.preventDefault();

    const roleNorm = normalizeRole(role.value);

    let deptValue = "";
    if (roleNorm === "ADMIN") {
        // Admin can belong to multiple departments.
        deptValue = getAdminDeptString();
        if (!deptValue) {
            appAlert("Please select at least one department for ADMIN.");
            return;
        }
        const bad = [...parseDeptSet(deptValue)].some((d) => !ALLOWED_DEPARTMENTS.includes(d));
        if (bad) {
            appAlert("Invalid department selection.");
            return;
        }
    } else {
        if (!ALLOWED_DEPARTMENTS.includes(departmentSelect.value)) {
            appAlert("Invalid department.");
            return;
        }
        deptValue = departmentSelect.value;
    }

    const newTeacher = {
        // Employee ID removed from UI; keep API field as blank/null.
        empId: "",
        firstName: empFn.value.trim().toUpperCase(),
        lastName: empLn.value.trim().toUpperCase(),
        department: deptValue,
        email: email.value.trim(),
        // Create requires a password; edit sends empty (keeps existing) and uses Reset Password button instead.
        password: editingId ? "" : defaultPasswordFor(empFn.value, empLn.value),
        role: roleNorm,
        status: status.value
    };

    const duplicateEmail = teacherDB.find(t =>
        (t.email || "").toLowerCase() === newTeacher.email.toLowerCase() &&
        String(t.id) !== String(editingId)
    );
    if (duplicateEmail) {
        appAlert("Email must be unique.");
        return;
    }

    (async () => {
        try {
            if (editingId) {
                await apiUpdateTeacher(editingId, newTeacher);
            } else {
                await apiCreateTeacher(newTeacher);
            }

            closeModal();
            await fetchTeachers();
        } catch (err) {
            console.error(err);
            appAlert(err.message || "Something went wrong.");
        }
    })();
});

/* ================= ACTIONS ================= */

tableBody?.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-action]");
    const action = btn?.dataset?.action;
    if (!action) return;

    const row = btn.closest("tr");
    const id = row?.dataset?.id;
    if (!id) return;

    if (action === "edit") openEditModal(id);
    if (action === "adminTime") openAdminTimeModal(id);
    if (action === "delete") deleteTeacher(id);
});

/* ================= EDIT ================= */

function openEditModal(id) {
    const teacher = teacherDB.find(t => String(t.id) === String(id));
    if (!teacher) return;

    if (!canManageUser(teacher)) {
        appAlert("You are not allowed to edit this user.");
        return;
    }

    editingId = id;

    empFn.value = teacher.firstName;
    empLn.value = teacher.lastName;
    email.value = teacher.email;

    if (resetPasswordBtn) resetPasswordBtn.classList.remove("is-hidden");

    const r = normalizeRole(teacher.role);
    role.value = r;
    applyRoleOptionsFilter(allowedRolesForCurrentUser(), true);
    syncDeptUiForRole(r);

    if (r === "ADMIN") {
        setAdminDeptSetFromString(teacher.department);
    } else {
        const firstDept = [...parseDeptSet(teacher.department)][0] || "";
        departmentSelect.value = firstDept;
    }

    status.value = teacher.status || "Active";

    document.getElementById("modalTitle").textContent = "Edit User";
    modal.classList.remove("hidden");
}

adminTimeCloseBtn?.addEventListener("click", () => adminTimeModal?.classList.add("hidden"));

resetPasswordBtn?.addEventListener("click", async () => {
    const id = String(editingId || "").trim();
    if (!id) return;

    const t = teacherDB.find(x => String(x.id) === id);
    if (!t || !canManageUser(t)) {
        appAlert("You are not allowed to reset this user's password.");
        return;
    }

    const ok = (typeof appConfirm === "function")
        ? await appConfirm("Reset password to default?", { title: "Reset Password", okText: "Reset", cancelText: "Cancel" })
        : confirm("Reset password to default?");
    if (!ok) return;

    try {
        await apiResetPassword(id);
        const pwd = defaultPasswordFor(empFn.value, empLn.value);
        appAlert(`Password reset to default: ${pwd}`);
    } catch (e) {
        console.error(e);
        appAlert(e?.message || "Password reset failed.");
    }
});

adminSelCancelBtn?.addEventListener("click", hideSelection);
adminSelType?.addEventListener("change", () => {
    if (!adminSelectionBar) return;
    if (adminSelectionBar.classList.contains("is-hidden")) return;
    applySelectionTypeRules();
});

adminSelSaveBtn?.addEventListener("click", async () => {
    const teacherId = String(__adminGridTeacherId__ || "").trim();
    if (!teacherId) return;

    const dayOfWeek = String(adminSelDay?.value || "").trim();
    const timeStart = String(adminSelStart?.value || "").trim();
    const timeEnd = String(adminSelEnd?.value || "").trim();
    const type = String(adminSelType?.value || "ADMIN").trim();

    if (!dayOfWeek || !timeStart || !timeEnd) {
        appAlert("Please select a slot and end time.");
        return;
    }

    try {
        await apiCreateTeacherBlock({ teacherId, type, dayOfWeek, timeStart, timeEnd });
        hideSelection();
        await renderAdminTimeGridForTeacher(teacherId);
    } catch (e) {
        console.error(e);
        appAlert(e.message || "Failed to create admin time.");
    }
});

// Click grid: select empty slot or delete an existing ADMIN/BREAK block.
adminTimeScheduleGrid?.addEventListener("click", async (e) => {
    const del = e.target.closest("[data-action='delete-admin-block']");
    if (del) {
        const id = del.getAttribute("data-block-id");
        if (!id) return;
        if (!confirm("Delete this admin/break block?")) return;
        try {
            await apiDeleteTeacherBlock(id);
            const teacherId = String(__adminGridTeacherId__ || "").trim();
            if (teacherId) await renderAdminTimeGridForTeacher(teacherId);
        } catch (err) {
            console.error(err);
            appAlert(err.message || "Failed to delete block.");
        }
        return;
    }

    const td = e.target.closest("td[data-day][data-start]");
    if (!td) return;
    if (td.dataset.occupied === "1") return; // don't add on occupied cells

    const dayFull = String(td.dataset.day || "").trim();
    const startHHMM = String(td.dataset.start || "").trim();
    if (!dayFull || !startHHMM) return;

    showSelection({ dayFull, startHHMM });
});

/* ================= DELETE ================= */

function deleteTeacher(id) {
    const t = teacherDB.find(x => String(x.id) === String(id));
    if (!t) return;
    if (!canManageUser(t)) {
        appAlert("You are not allowed to delete this user.");
        return;
    }

    const doIt = async () => {
        if (typeof appConfirm === "function") {
            return await appConfirm("Delete this user?", { title: "Confirm", okText: "Delete", cancelText: "Cancel" });
        }
        return confirm("Delete this user?");
    };

    (async () => {
        const ok = await doIt();
        if (!ok) return;

        try {
            await apiDeleteTeacher(id);
            await fetchTeachers();
        } catch (err) {
            console.error(err);
            appAlert(err.message || "Something went wrong.");
        }
    })();
}

/* ================= MODAL ================= */

addBtn.addEventListener("click", () => {
    editingId = null;
    form.reset();
    setAdminDeptSetFromString("");

    // Apply create-role restrictions for current user.
    applyRoleOptionsFilter(allowedRolesForCurrentUser(), false);
    syncDeptUiForRole(role.value);

    if (resetPasswordBtn) resetPasswordBtn.classList.add("is-hidden");
    document.getElementById("modalTitle").textContent = "Add User";
    modal.classList.remove("hidden");
});

cancelBtn.addEventListener("click", closeModal);

function closeModal() {
    modal.classList.add("hidden");
    form.reset();
    editingId = null;
    setAdminDeptSetFromString("");
    syncDeptUiForRole(role.value);
    if (resetPasswordBtn) resetPasswordBtn.classList.add("is-hidden");
}

empFn.addEventListener("input", autoGenerateCredentials);
empLn.addEventListener("input", autoGenerateCredentials);
role.addEventListener("change", () => syncDeptUiForRole(role.value));

function autoGenerateCredentials() {
    const first = empFn.value.trim().toLowerCase().replace(/\s+/g, "");
    const last  = empLn.value.trim().toLowerCase().replace(/\s+/g, "");

    if (first && last) {
        email.value = `${first}.${last}@zcs.edu`;
    }
}

function defaultPasswordFor(firstName, lastName) {
    const f = String(firstName || "").trim().toLowerCase().replace(/\s+/g, "");
    const l = String(lastName || "").trim().toLowerCase().replace(/\s+/g, "");
    if (!f || !l) return "password";
    return `${f.charAt(0)}${l}`;
}



function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* ================= INIT ================= */

(async () => {
    try {
        await loadSearchComponent();
        initHeaderSort();
        await loadCurrentUserContext();
        await fetchTeachers();
    } catch (err) {
        console.error(err);
        renderTeachers([]);
    }
})();
