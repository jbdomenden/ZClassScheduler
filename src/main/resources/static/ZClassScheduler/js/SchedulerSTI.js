/* =========================================================
   STI Tertiary Scheduler

   - Program dropdown: Curriculums.courseCode where dept == "TERTIARY_STI" and active == true
   - Curriculum dropdown: Curriculums.name where courseCode == selected Program and dept == "TERTIARY_STI"
   - Create block: POST /api/scheduler/tertiary/blocks
   - View renders schedule block table like reference screenshot
========================================================= */

const API = {
    blocks: "/api/scheduler/tertiary/blocks",
    createBlock: "/api/scheduler/tertiary/blocks",
    deleteBlock: (sectionCode) => `/api/scheduler/tertiary/blocks/${encodeURIComponent(sectionCode)}`,
    updateRow: (id) => `/api/scheduler/tertiary/rows/${encodeURIComponent(id)}`,
    duplicateRow: "/api/scheduler/tertiary/rows",
    deleteRow: (id) => `/api/scheduler/tertiary/rows/${encodeURIComponent(id)}`,

    rooms: "/api/settings/rooms",
    teachers: "/api/settings/teachers",
    curriculums: "/api/settings/curriculums",
    academicPeriod: "/api/settings/academic-period/current",
    schoolHoursActive: "/api/settings/school-hours/active",
};

const token = localStorage.getItem("token");
function authHeaders() {
    return token ? { "Authorization": `Bearer ${token}` } : {};
}

let blocks = [];
let openSectionCode = null; // keep expanded section open across refresh/edit
let rooms = [];
let teachers = [];
let curriculums = [];
let searchInput = null;
let sortKey = "courseCode";
let sortDir = "asc";
let activeAcademicPeriod = null;

// DOM
const blocksBody = document.querySelector("#blocksTable tbody");
const addBlockBtn = document.getElementById("addBlockBtn");
const refreshBtn = document.getElementById("refreshBtn");

// Wizard
const wizardModal = document.getElementById("wizardModal");
const wizardForm = document.getElementById("wizardForm");
const wizardCancelBtn = document.getElementById("wizardCancelBtn");
const programSelect = document.getElementById("programSelect");
const curriculumSelect = document.getElementById("curriculumSelect");
const yearSelect = document.getElementById("yearSelect");
const termSelect = document.getElementById("termSelect");

// Edit row
const editRowModal = document.getElementById("editRowModal");
const editRowForm = document.getElementById("editRowForm");
const editCancelBtn = document.getElementById("editCancelBtn");
const editScheduleId = document.getElementById("editScheduleId");
const editDay = document.getElementById("editDay");
const editStart = document.getElementById("editStart");
const editEnd = document.getElementById("editEnd");
const editRoom = document.getElementById("editRoom");
const editTeacher = document.getElementById("editTeacher");
const editSuggestBtn = document.getElementById("editSuggestBtn");
const editSuggestBox = document.getElementById("editSuggestBox");

/* ===========================
   Helpers
=========================== */


function getWizardSubmitBtn() {
    return wizardForm?.querySelector('button[type="submit"]') || null;
}

function renderAcademicPeriodHint() {
    if (!wizardForm) return;
    let hint = wizardForm.querySelector('[data-academic-period-hint]');
    if (!hint) {
        hint = document.createElement('div');
        hint.setAttribute('data-academic-period-hint', '1');
        hint.style.margin = '0 0 12px';
        hint.style.padding = '8px 10px';
        hint.style.borderRadius = '8px';
        hint.style.fontSize = '12px';
        wizardForm.prepend(hint);
    }
    const submit = getWizardSubmitBtn();
    if (!activeAcademicPeriod) {
        hint.style.background = '#fff1f2';
        hint.style.border = '1px solid #fecaca';
        hint.textContent = 'No active school year/term is configured. Schedule block creation is disabled.';
        if (submit) submit.disabled = true;
        return;
    }

    hint.style.background = '#eff6ff';
    hint.style.border = '1px solid #bfdbfe';
    hint.textContent = `Academic Period (locked by settings): ${activeAcademicPeriod.schoolYear} | Term ${activeAcademicPeriod.term}`;
    if (submit) submit.disabled = false;
}

async function loadActiveAcademicPeriod() {
    try {
        const res = await fetchJson(API.academicPeriod);
        activeAcademicPeriod = (res && res.success !== false && res.schoolYear && res.term)
            ? { schoolYear: String(res.schoolYear), term: String(res.term) }
            : null;
    } catch (_err) {
        activeAcademicPeriod = null;
    }
    renderAcademicPeriodHint();
    return activeAcademicPeriod;
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const ICONS = {
    edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.7 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L20.7 7.04z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9zm-1 14h12a2 2 0 0 0 2-2V7H4v14a2 2 0 0 0 2 2z"/></svg>`,
    view: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>`,
};

// Time policy for the schedule grid (must match backend ScheduleTimePolicy)
let TIME_POLICY = {
    startMin: "07:00",
    startMax: "20:30",
    endMax: "21:00",
    stepSeconds: 1800, // 30 minutes
    allowedDurations: [60, 90, 120, 180], // minutes
};


function applyDynamicTimePolicyFromSchoolHours(dayRules) {
    const openRules = (dayRules || []).filter((r) => !!r?.isOpen);
    if (!openRules.length) return;

    const starts = openRules.map((r) => hhmmToMinutes(String(r?.timeStart || "").slice(0, 5))).filter((n) => Number.isFinite(n));
    const ends = openRules.map((r) => hhmmToMinutes(String(r?.timeEnd || "").slice(0, 5))).filter((n) => Number.isFinite(n));
    if (!starts.length || !ends.length) return;

    const startMin = Math.min(...starts);
    const endMax = Math.max(...ends);
    const startMax = endMax - 30;
    if (startMin >= startMax) return;

    TIME_POLICY = {
        ...TIME_POLICY,
        startMin: minutesToHHMM(startMin),
        startMax: minutesToHHMM(startMax),
        endMax: minutesToHHMM(endMax),
    };
}

async function loadSchoolHoursConfig() {
    try {
        const res = await fetchJson(API.schoolHoursActive);
        const data = res?.data || null;
        const dayRules = Array.isArray(data?.dayRules) ? data.dayRules : (Array.isArray(data?.rules) ? data.rules : []);
        applyDynamicTimePolicyFromSchoolHours(dayRules);
    } catch (_err) {
        // Keep default 07:00-21:00 fallback when settings are unavailable.
    }
}

function hhmmToMinutes(v) {
    const s = String(v || "").trim();
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (!m) return null;
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
}

function minutesToHHMM(total) {
    const t = Math.max(0, Math.min(23 * 60 + 59, total | 0));
    const hh = String(Math.floor(t / 60)).padStart(2, "0");
    const mm = String(t % 60).padStart(2, "0");
    return `${hh}:${mm}`;
}

function buildHalfHourRange(fromHHMM, toHHMM) {
    const from = hhmmToMinutes(fromHHMM);
    const to = hhmmToMinutes(toHHMM);
    if (from == null || to == null || to < from) return [];

    const stepMinutes = Math.max(1, Math.floor((TIME_POLICY.stepSeconds || 1800) / 60));
    const out = [];
    for (let m = from; m <= to; m += stepMinutes) out.push(minutesToHHMM(m));
    return out;
}

function snapToHalfHour(minutes) {
    const rem = minutes % 30;
    if (rem === 0) return minutes;
    const down = minutes - rem;
    const up = minutes + (30 - rem);
    return (minutes - down) <= (up - minutes) ? down : up;
}

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function validEndTimesForStart(startHHMM) {
    const start = hhmmToMinutes(startHHMM);
    const endMax = hhmmToMinutes(TIME_POLICY.endMax);
    if (start == null || endMax == null) return [];

    const ends = TIME_POLICY.allowedDurations
        .map(d => start + d)
        .filter(end => end <= endMax)
        .map(minutesToHHMM);

    return [...new Set(ends)].sort((a, b) => (hhmmToMinutes(a) ?? 0) - (hhmmToMinutes(b) ?? 0));
}

function nearestHHMM(targetHHMM, candidates) {
    const t = hhmmToMinutes(targetHHMM);
    if (t == null || !candidates?.length) return candidates?.[0] ?? "";

    let best = candidates[0];
    let bestDist = Math.abs((hhmmToMinutes(best) ?? 0) - t);
    for (const c of candidates) {
        const cm = hhmmToMinutes(c);
        if (cm == null) continue;
        const d = Math.abs(cm - t);
        if (d < bestDist) {
            best = c;
            bestDist = d;
        }
    }
    return best;
}

function isStaffDepartment(deptRaw) {
    const parts = String(deptRaw || "")
        .split(/[;,|]/g)
        .map((x) => String(x || "").trim().toUpperCase())
        .filter(Boolean);
    return parts.includes("STAFF") || parts.includes("NON_TEACHING");
}

function isLaboratoryRoom(roomObj) {
    const typ = String(roomObj?.type || roomObj?.roomType || roomObj?.category || "").toUpperCase();
    const code = String(roomObj?.code || roomObj?.name || "").toUpperCase();
    return typ.includes("LAB") || code.includes("LAB");
}

function overlaps(sm, em, sm2, em2) {
    return sm < em2 && sm2 < em;
}

function flattenScheduledRows() {
    const out = [];
    (blocks || []).forEach((b) => {
        const sectionKey = String(b?.sectionCode || b?.section || "").trim();
        (b.rows || []).forEach((r) => {
            const day = String(r?.dayOfWeek || "").trim().toUpperCase();
            const start = String(r?.timeStart || "").trim();
            const end = String(r?.timeEnd || "").trim();
            if (!day || !start || !end) return;
            const sm = hhmmToMinutes(start);
            const em = hhmmToMinutes(end);
            if (sm == null || em == null || em <= sm) return;
            out.push({
                id: String(r?.id || ""),
                day,
                sm,
                em,
                roomId: r?.roomId ? String(r.roomId) : "",
                teacherId: r?.teacherId ? String(r.teacherId) : "",
                sectionKey,
            });
        });
    });
    return out;
}

function findSectionKeyForRowId(rowId) {
    const rid = String(rowId || "").trim();
    if (!rid) return "";
    for (const b of (blocks || [])) {
        const sectionKey = String(b?.sectionCode || b?.section || "").trim();
        for (const r of (b?.rows || [])) {
            if (String(r?.id || "") === rid) return sectionKey;
        }
    }
    return "";
}

async function fetchAllSchedulerRowsForSuggestion() {
    const endpoints = [
        "/api/scheduler/tertiary/blocks",
        "/api/scheduler/namei/blocks",
        "/api/scheduler/shs/blocks",
        "/api/scheduler/jhs/blocks",
    ];

    const results = await Promise.all(endpoints.map(async (url) => {
        try {
            const res = await fetch(url, { headers: { "Accept": "application/json", ...authHeaders() } });
            if (!res.ok) {
                console.warn("[suggest] unable to load rows from", url, "status", res.status);
                return [];
            }
            const data = await res.json();
            if (!Array.isArray(data)) return [];

            const out = [];
            data.forEach((b) => {
                const sectionKey = String(b?.sectionCode || b?.section || "").trim();
                (b?.rows || []).forEach((r) => {
                    const day = String(r?.dayOfWeek || "").trim().toUpperCase();
                    const start = String(r?.timeStart || "").trim();
                    const end = String(r?.timeEnd || "").trim();
                    if (!day || !start || !end) return;
                    const sm = hhmmToMinutes(start);
                    const em = hhmmToMinutes(end);
                    if (sm == null || em == null || em <= sm) return;
                    out.push({
                        id: String(r?.id || ""),
                        day,
                        sm,
                        em,
                        roomId: r?.roomId ? String(r.roomId) : "",
                        teacherId: r?.teacherId ? String(r.teacherId) : "",
                        sectionKey,
                    });
                });
            });
            return out;
        } catch (err) {
            console.warn("[suggest] fetch failed for", url, err);
            return [];
        }
    }));

    return results.flat();
}

async function suggestForEditModal() {
    if (!editSuggestBox) return;
    editSuggestBox.textContent = "";

    const schedId = String(editScheduleId?.value || "").trim();
    const selectedTeacherId = String(editTeacher?.value || "").trim();
    if (!selectedTeacherId) {
        editSuggestBox.textContent = "Select an Instructor first.";
        return;
    }

    const sectionKey = findSectionKeyForRowId(schedId);
    if (!sectionKey) {
        editSuggestBox.textContent = "Missing section context for this row.";
        return;
    }

    const dayPref = String(editDay?.value || "").trim().toUpperCase();
    const startPref = String(editStart?.value || "").trim();
    const endPref = String(editEnd?.value || "").trim();

    let duration = TIME_POLICY.allowedDurations?.[0] || 60;
    const smPref = startPref ? hhmmToMinutes(startPref) : null;
    const emPref = endPref ? hhmmToMinutes(endPref) : null;
    if (smPref != null && emPref != null && emPref > smPref) duration = emPref - smPref;
    if (!TIME_POLICY.allowedDurations.includes(duration)) {
        // Pick the nearest allowed duration
        duration = TIME_POLICY.allowedDurations
            .slice()
            .sort((a, b) => Math.abs(a - duration) - Math.abs(b - duration))[0];
    }


    const selectedRoomId = String((typeof editRoom !== "undefined" ? editRoom?.value : roomSelect?.value) || "").trim();
    const selectedRoomObj = (rooms || []).find((r) => String(r?.id || "") === selectedRoomId);
    const noExplicitDuration = !(smPref != null && emPref != null && emPref > smPref);
    if (selectedRoomObj && isLaboratoryRoom(selectedRoomObj) && noExplicitDuration) {
        duration = 180;
    }

    const localRows = flattenScheduledRows();
    const globalRows = await fetchAllSchedulerRowsForSuggestion();
    const seen = new Set();
    const allRows = [...localRows, ...globalRows]
        .filter((r) => r.id !== schedId)
        .filter((r) => {
            const k = `${r.id}|${r.day}|${r.sm}|${r.em}|${r.roomId}|${r.teacherId}|${r.sectionKey}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
        });

    const daysBase = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
    const dayCandidates = dayPref && daysBase.includes(dayPref)
        ? [dayPref, ...daysBase.filter((d) => d !== dayPref)]
        : daysBase.slice();

    const startCandidatesBase = buildHalfHourRange(TIME_POLICY.startMin, TIME_POLICY.startMax)
        .filter((s) => {
            const sm = hhmmToMinutes(s);
            const endMax = hhmmToMinutes(TIME_POLICY.endMax);
            return sm != null && endMax != null && (sm + duration) <= endMax;
        });

    const startCandidates = (smPref != null)
        ? startCandidatesBase.slice().sort((a, b) => {
            const da = Math.abs((hhmmToMinutes(a) ?? 0) - smPref);
            const db = Math.abs((hhmmToMinutes(b) ?? 0) - smPref);
            return da - db;
        })
        : startCandidatesBase;

    // Prefer currently selected room (if any), otherwise by room code.
    const roomPref = String(editRoom?.value || "").trim();
    const roomCandidates = (rooms || [])
        .slice()
        .sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
    if (roomPref) {
        const idx = roomCandidates.findIndex((r) => String(r?.id || "") === roomPref);
        if (idx > 0) roomCandidates.unshift(roomCandidates.splice(idx, 1)[0]);
    }

    // Find first slot that fits both instructor + section schedules, then pick a free room.
    const roomBlockedHints = [];

    for (const day of dayCandidates) {
        const teacherBusy = allRows.filter((r) => r.day === day && r.teacherId === selectedTeacherId);
        const sectionBusy = allRows.filter((r) => r.day === day && r.sectionKey === sectionKey);

        for (const start of startCandidates) {
            const sm = hhmmToMinutes(start);
            if (sm == null) continue;
            const em = sm + duration;

            const teacherConflict = teacherBusy.some((x) => overlaps(sm, em, x.sm, x.em));
            if (teacherConflict) continue;
            const sectionConflict = sectionBusy.some((x) => overlaps(sm, em, x.sm, x.em));
            if (sectionConflict) continue;

            const freeRoom = roomCandidates.find((rm) => {
                const rid = String(rm?.id || "");
                if (!rid) return false;
                return !allRows.some((x) => x.day === day && x.roomId === rid && overlaps(sm, em, x.sm, x.em));
            });

            if (!freeRoom) {
            if (roomBlockedHints.length < 3) roomBlockedHints.push(`${day} ${start}-${minutesToHHMM(em)}`);
            continue;
        }

            const endHHMM = minutesToHHMM(em);

            if (editDay) editDay.value = day;
            if (editStart) editStart.value = start;
            updateEditEndTimes(endHHMM);
            if (editEnd) editEnd.value = endHHMM;
            if (editRoom) editRoom.value = String(freeRoom.id);

            editSuggestBox.textContent =
                `Suggested for Instructor + Section:\n` +
                `Day/Time: ${day} ${start}-${endHHMM}\n` +
                `Room: ${String(freeRoom.code || "").trim() || "—"}`;
            return;
        }
    }

    editSuggestBox.textContent = "No available Day/Time/Room found that fits both the Instructor and the Section." +
        (roomBlockedHints.length ? `\nClosest time options blocked by room conflicts: ${roomBlockedHints.join(", ")}` : "");
}

function updateEditEndTimes(preferredEnd = null) {
    if (!editEnd) return;
    const start = (editStart?.value || "").trim();
    const options = start ? validEndTimesForStart(start) : [];

    editEnd.innerHTML =
        `<option value="">(Unset)</option>` +
        options.map(t => `<option value="${t}">${t}</option>`).join("");

    if (preferredEnd && options.includes(preferredEnd)) editEnd.value = preferredEnd;
    else editEnd.value = "";
}

function fillEditTimes() {
    if (!editStart || !editEnd) return;

    const starts = buildHalfHourRange(TIME_POLICY.startMin, TIME_POLICY.startMax)
        .filter(s => validEndTimesForStart(s).length > 0);

    editStart.innerHTML =
        `<option value="">(Unset)</option>` +
        starts.map(t => `<option value="${t}">${t}</option>`).join("");

    updateEditEndTimes(null);
}

async function safeJson(res) {
    try {
        const txt = await res.text();
        if (!txt) return null;
        return JSON.parse(txt);
    } catch {
        return null;
    }
}


async function fetchJson(url, options) {
    const res = await fetch(url, {
        ...(options || {}),
        headers: {
            ...authHeaders(),
            ...((options || {}).headers || {}),
        },
    });

    // Read text once; we decide how to parse
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const txt = await res.text();

    if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        // Try JSON error message first
        try {
            if (txt) {
                const j = JSON.parse(txt);
                msg = j?.message || msg;
            }
        } catch {
            // If server returned plain text
            if (txt) msg = txt;
        }
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }

    // No content
    if (res.status === 204 || !txt) return null;

    // JSON
    if (contentType.includes("application/json")) {
        try { return JSON.parse(txt); } catch { return null; }
    }

    // Fallback: return text
    return txt;
}



function ensureAddRowStyles() {
    if (document.getElementById("stiAddRowStyles")) return;
    const style = document.createElement("style");
    style.id = "stiAddRowStyles";
    style.textContent = `
/* Hover + add-row handle on subject head row bottom border */
.sti-sched-table tr.subject-head { }
.sti-sched-table tr.subject-head:hover .add-row-handle { display: inline-flex; }
.sti-sched-table .actions-cell { position: relative; }
.sti-sched-table .add-row-handle{
  position:absolute;
  left:50%;
  bottom:-1px;
  transform:translate(-50%, 50%);
  width:24px;
  height:24px;
  border-radius:999px;
  background:#1e3a8a;
  color:#fff;
  font-size:16px;
  font-weight:800;
  display:none;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  box-shadow:0 4px 12px rgba(0,0,0,.25);
  user-select:none;
  z-index:5;
}
.sti-sched-table .add-row-handle:hover{
  background:#2563eb;
  transform:translate(-50%, 50%) scale(1.08);
}
.sti-sched-table .dup-delete-btn{
  margin-left:8px;
}
`;
    document.head.appendChild(style);
}

function normalizeDept(v) {
    const x = String(v || "").trim().toUpperCase();
    if (x === "TERTIARY STI") return "TERTIARY_STI";
    return x;
}

function shortDay(d) {
    const v = String(d || "").toUpperCase();
    if (!v) return "\u2014";
    if (v.startsWith("MON")) return "MON";
    if (v.startsWith("TUE")) return "TUE";
    if (v.startsWith("WED")) return "WED";
    if (v.startsWith("THU")) return "THU";
    if (v.startsWith("FRI")) return "FRI";
    if (v.startsWith("SAT")) return "SAT";
    return v;
}

function formatTime12h(hhmm) {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "\u2014";
    const [hStr, m] = hhmm.split(":");
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
}

function timeRange(start, end) {
    if (!start || !end) return "\u2014";
    return `${formatTime12h(start)} \u2013 ${formatTime12h(end)}`;
}

function getRoomLabel(roomId, row) {
    // Prefer lookup by id when rooms list is available
    if (roomId) {
        const found = rooms.find(r => String(r.id) === String(roomId));
        if (found?.code) return found.code;
        if (found?.name) return found.name;
    }
    // Fallback: use row-provided fields if backend includes them
    if (row) {
        return row.roomCode || row.room || row.roomName || "\u2014";
    }
    return "\u2014";
}

function getTeacherLabel(teacherId, row) {
    if (teacherId) {
        const t = teachers.find(x => String(x.id) === String(teacherId));
        if (t) {
            const dept = (t.department || "").trim();
            const last = (t.lastName || "").trim();
            const first = (t.firstName || "").trim();
            return `${dept} ${last}`.trim() || `${first} ${last}`.trim() || t.email || "\u2014";
        }
    }
    // Fallback: use row-provided fields if backend includes them
    if (row) {
        return row.instructor || row.instructorName || row.teacherName || row.teacher || "\u2014";
    }
    return "\u2014";
}

/* ===========================
   Search component
=========================== */

async function loadSearchComponent() {
    const container = document.getElementById("searchContainer");
    if (!container) return;

    const res = await fetch("/ZClassScheduler/html/GlobalSearch.html");
    container.innerHTML = await res.text();

    searchInput = document.querySelector("#searchInput");
    if (searchInput) searchInput.addEventListener("input", renderBlocks);

    const clearBtn = container.querySelector(".clear-btn");
    if (clearBtn && searchInput) {
        const sync = () => (clearBtn.style.display = searchInput.value ? "block" : "none");
        searchInput.addEventListener("input", sync);
        clearBtn.addEventListener("click", () => {
            searchInput.value = "";
            sync();
            renderBlocks();
        });
        sync();
    }
}

/* ===========================
   Load Rooms & Teachers
=========================== */

async function loadRoomsTeachers() {
    const [r, t] = await Promise.all([fetchJson(API.rooms), fetchJson(API.teachers)]);

    rooms = (r || []).map(x => ({ id: x.id, code: x.code || x.name || "" }));

    const normRole = (v) => String(v || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/-/g, "_");
    const disallowed = new Set(["CHECKER", "NON_TEACHING", "STAFF"]);

    teachers = (t || [])
        .filter(x => !disallowed.has(normRole(x?.role)) && !isStaffDepartment(x?.department))
        .map(x => ({
        id: x.id,
        firstName: x.firstName,
        lastName: x.lastName,
        department: x.department,
        email: x.email,
    }));

    editRoom.innerHTML =
        `<option value="">(Unset)</option>` +
        rooms.map(rm => `<option value="${escapeHtml(rm.id)}">${escapeHtml(rm.code)}</option>`).join("");

    editTeacher.innerHTML =
        `<option value="">(Unset)</option>` +
        teachers.map(tc => {
            const dept = (tc.department || "").trim();
            const last = (tc.lastName || "").trim();
            const first = (tc.firstName || "").trim();
            const label = `${dept} ${last}`.trim() || `${first} ${last}`.trim() || tc.email;
            return `<option value="${escapeHtml(tc.id)}">${escapeHtml(label)}</option>`;
        }).join("");
}

/* ===========================
Curriculums - wizard dropdowns
=========================== */

async function loadCurriculums() {
    try {
        const list = (await fetchJson(API.curriculums)) || [];
        curriculums = list.filter(c => c && c.active !== false);
    } catch (e) {
        console.warn("loadCurriculums failed:", e);
        curriculums = [];
        // Do not block page; wizard can still work if blocks exist
    }
}

function populateProgramOptions() {
    const eligible = curriculums.filter(c => normalizeDept(c.dept) === "TERTIARY_STI");

    const programSet = new Set(
        eligible.map(c => String(c.courseCode || "").trim().toUpperCase()).filter(Boolean)
    );
    const programs = Array.from(programSet).sort((a, b) => a.localeCompare(b));

    programSelect.innerHTML =
        `<option value="" disabled selected>Select Program</option>` +
        programs.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");

    curriculumSelect.innerHTML = `<option value="" disabled selected>Select Curriculum</option>`;
}

function populateCurriculumOptions(programCode) {
    const p = String(programCode || "").trim().toUpperCase();
    const list = curriculums
        .filter(c => normalizeDept(c.dept) === "TERTIARY_STI")
        .filter(c => String(c.courseCode || "").trim().toUpperCase() === p)
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    curriculumSelect.innerHTML =
        `<option value="" disabled selected>Select Curriculum</option>` +
        list.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || "(Unnamed)")}</option>`).join("");
}

/* ===========================
   Blocks
=========================== */

async function loadBlocks() {
    blocks = (await fetchJson(API.blocks)) || [];

    // Frontend guard: only show blocks that belong to STI tertiary curriculums.
    // Backend also filters, but this prevents accidental cross-scheduler bleed if APIs change.
    const allowedCurriculumIds = new Set(
        (curriculums || [])
            .filter(c => c && c.active !== false)
            .filter(c => normalizeDept(c.dept) === "TERTIARY_STI")
            .map(c => String(c.id || "").trim())
            .filter(Boolean)
    );
    if (allowedCurriculumIds.size) {
        blocks = (blocks || []).filter(b => b && b.curriculumId && allowedCurriculumIds.has(String(b.curriculumId)));
    }

    // Stable sort: subject code, then base row first, then id
    blocks.forEach(b => (b.rows || []).sort((a, b2) => {
        const c = String(a.subjectCode || "").localeCompare(String(b2.subjectCode || ""));
        if (c) return c;
        const da = a.isDuplicateRow ? 1 : 0;
        const db = b2.isDuplicateRow ? 1 : 0;
        if (da !== db) return da - db;
        return String(a.id || "").localeCompare(String(b2.id || ""));
    }));

    renderBlocks();

    // Re-open expanded block if needed
    if (openSectionCode) {
        const block = blocks.find(b => String(b.sectionCode) === String(openSectionCode));
        const row = [...blocksBody.querySelectorAll("tr")].find(r => String(r.dataset.section) === String(openSectionCode));
        if (block && row) {
            const detail = document.createElement("tr");
            detail.className = "detail-row";
            const td = document.createElement("td");
            td.colSpan = 6;
            td.innerHTML = renderScheduleBlockTable(block);
            detail.appendChild(td);
            row.after(detail);
            bindScheduleBlockHandlers(detail, block);
        }
    }
}


function renderBlocks() {
    const q = (searchInput?.value || "").trim().toLowerCase();

    const data = !q
        ? blocks
        : blocks.filter(b =>
            (b.sectionCode || "").toLowerCase().includes(q) ||
            (b.courseCode || "").toLowerCase().includes(q) ||
            (b.curriculumName || "").toLowerCase().includes(q)
        );

    const sorted = (data || []).slice().sort(compareBlocks);

    blocksBody.innerHTML = "";

    if (!sorted.length) {
        blocksBody.innerHTML = `<tr><td colspan="6">No schedules found.</td></tr>`;
        return;
    }

    sorted.forEach(b => {
        const tr = document.createElement("tr");
        tr.dataset.section = b.sectionCode;

        tr.innerHTML = `
      <td>
        <div style="font-weight:600;">${escapeHtml(b.sectionCode)}</div>
        <div style="font-size:12px;opacity:.8;">${escapeHtml(b.curriculumName || "")}</div>
      </td>
      <td>${escapeHtml(b.courseCode)}</td>
      <td>${escapeHtml(b.year)}</td>
      <td>${escapeHtml(b.term)}</td>
      <td>${b.active ? "Active" : "Inactive"}</td>
      <td>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button class="btn btn-secondary btn-icon" data-action="view" data-section="${escapeHtml(b.sectionCode)}" title="View" aria-label="View">${ICONS.view}</button>
          <button class="btn btn-delete btn-icon" data-action="delete" data-section="${escapeHtml(b.sectionCode)}" title="Delete" aria-label="Delete">${ICONS.trash}</button>
        </div>
      </td>
    `;
        blocksBody.appendChild(tr);
    });

    // Re-open expanded block if needed (after sort/search)
    if (openSectionCode) {
        const block = blocks.find(b => String(b.sectionCode) === String(openSectionCode));
        const row = [...blocksBody.querySelectorAll("tr")].find(r => String(r.dataset.section) === String(openSectionCode));
        if (block && row) {
            const existing = row.nextElementSibling;
            if (!existing || !existing.classList.contains("detail-row")) {
                const detail = document.createElement("tr");
                detail.className = "detail-row";
                const td = document.createElement("td");
                td.colSpan = 6;
                td.innerHTML = renderScheduleBlockTable(block);
                detail.appendChild(td);
                row.after(detail);
                bindScheduleBlockHandlers(detail, block);
            }
        }
    }
}

function normalizeSortVal(v) {
    if (v == null) return "";
    if (typeof v === "number") return v;
    const s = String(v).trim();
    const n = Number(s);
    if (!Number.isNaN(n) && s !== "") return n;
    return s.toLowerCase();
}

function compareBlocks(a, b) {
    const dir = sortDir === "desc" ? -1 : 1;

    const av = normalizeSortVal(a?.[sortKey]);
    const bv = normalizeSortVal(b?.[sortKey]);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;

    // default tie-breakers: program -> year -> term -> section
    const t1 = normalizeSortVal(a?.courseCode);
    const t2 = normalizeSortVal(b?.courseCode);
    if (t1 < t2) return -1;
    if (t1 > t2) return 1;

    const y1 = normalizeSortVal(a?.year);
    const y2 = normalizeSortVal(b?.year);
    if (y1 < y2) return -1;
    if (y1 > y2) return 1;

    const tr1 = normalizeSortVal(a?.term);
    const tr2 = normalizeSortVal(b?.term);
    if (tr1 < tr2) return -1;
    if (tr1 > tr2) return 1;

    return String(a?.sectionCode || "").localeCompare(String(b?.sectionCode || ""));
}

function updateSortUI() {
    const table = document.getElementById("blocksTable");
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
    const table = document.getElementById("blocksTable");
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
        renderBlocks();
    });

    // Default: program then year
    sortKey = "courseCode";
    sortDir = "asc";
    updateSortUI();
}

blocksBody.addEventListener("click", async (e) => {
    const action = e.target?.dataset?.action;
    if (!action) return;

    const section = e.target?.dataset?.section;
    const tr = e.target.closest("tr");

    if (action === "view") {
        const block = blocks.find(b => String(b.sectionCode) === String(section));
        if (!block || !tr) return;

        const existing = tr.nextElementSibling;
        if (existing && existing.classList.contains("detail-row")) {
            existing.remove();
            openSectionCode = null;
            return;
        }

        document.querySelectorAll(".detail-row").forEach(x => x.remove());

        const detail = document.createElement("tr");
        detail.className = "detail-row";
        detail.innerHTML = `<td colspan="6">${renderScheduleBlockTable(block)}</td>`;
        tr.after(detail);
        openSectionCode = section;

        bindScheduleBlockHandlers(detail, block);
        return;
    }

    if (action === "delete") {
        if (!section) return;
        if (!confirm(`Delete entire block ${section}?`)) return;

        try {
            await fetchJson(API.deleteBlock(section), { method: "DELETE" });
            await loadBlocks();
        } catch (err) {
            console.error(err);
            appAlert(err.message || "Delete failed.");
        }
    }
});

/* ===========================
   Expanded schedule block table
=========================== */

function renderScheduleBlockTable(block) {
    const rows = block.rows || [];
    const sectionRowspan = rows.length || 1;

    const sectionCell = `
    <div style="text-transform:uppercase;font-weight:600;">${escapeHtml(block.sectionCode || "")}</div>
    <div style="font-size:12px;opacity:.85;">${escapeHtml(block.curriculumName || "")}</div>
  `;

    // Group by subject (COURSE CODE + DESCRIPTION) so duplicates share rowspan
    const keyOf = (r) => String(r.subjectCode || "") + "||" + String(r.subjectName || "");
    const countByKey = new Map();
    const firstIdxByKey = new Map();

    rows.forEach((r, i) => {
        const k = keyOf(r);
        countByKey.set(k, (countByKey.get(k) || 0) + 1);
        if (!firstIdxByKey.has(k)) firstIdxByKey.set(k, i);
    });

    let html = `
    <div style="margin:10px 0;">
      <table class="sti-sched-table" style="width:100%;border-collapse:separate;border-spacing:0;overflow:hidden;border-radius:10px;">
        <thead>
          <tr style="background:#f1f1f1;">
            <th style="padding:10px;border:1px solid #999;">SECTION</th>
            <th style="padding:10px;border:1px solid #999;">COURSE CODE</th>
            <th style="padding:10px;border:1px solid #999;">COURSE DESCRIPTION</th>
            <th style="padding:10px;border:1px solid #999;">DAY</th>
            <th style="padding:10px;border:1px solid #999;">TIME</th>
            <th style="padding:10px;border:1px solid #999;">ROOM</th>
            <th style="padding:10px;border:1px solid #999;">INSTRUCTOR</th>
            <th style="padding:10px;border:1px solid #999;">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
  `;

    rows.forEach((r, idx) => {
        const k = keyOf(r);
        const isHead = firstIdxByKey.get(k) === idx;
        const subjectSpan = countByKey.get(k) || 1;

        html += `<tr class="sched-row ${isHead ? "subject-head" : ""}" data-id="${escapeHtml(r.id)}" style="background:#c9f7b6;">`;

        if (idx === 0) {
            html += `<td rowspan="${sectionRowspan}" style="padding:10px;border:1px solid #666;vertical-align:middle;">${sectionCell}</td>`;
        }

        if (isHead) {
            html += `<td rowspan="${subjectSpan}" style="padding:10px;border:1px solid #666;vertical-align:middle;">${escapeHtml(r.subjectCode || "") || "&nbsp;"}</td>`;
            html += `<td rowspan="${subjectSpan}" style="padding:10px;border:1px solid #666;vertical-align:middle;">${escapeHtml(r.subjectName || "") || "&nbsp;"}</td>`;
        }

        html += `
      <td style="padding:10px;border:1px solid #666;text-align:center;">${escapeHtml(shortDay(r.dayOfWeek))}</td>
      <td style="padding:10px;border:1px solid #666;text-align:center;">${escapeHtml(timeRange(r.timeStart, r.timeEnd))}</td>
      <td style="padding:10px;border:1px solid #666;text-align:center;">${escapeHtml(getRoomLabel(r.roomId, r))}</td>
      <td style="padding:10px;border:1px solid #666;text-align:center;">${escapeHtml(getTeacherLabel(r.teacherId, r))}</td>
      <td class="actions-cell" style="padding:10px;border:1px solid #666;text-align:center;">
        <button class="btn btn-secondary btn-icon" data-action="edit-row" title="Edit" aria-label="Edit">${ICONS.edit}</button>
        ${isHead ? `<span class="add-row-handle" data-action="add-row" title="Add schedule row">+</span>` : ``}
        ${r.isDuplicateRow ? `<button class="btn btn-delete btn-icon dup-delete-btn" data-action="delete-row" title="Delete added row" aria-label="Delete added row">${ICONS.trash}</button>` : ``}
      </td>
    `;

        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    return html;
}


function bindScheduleBlockHandlers(detailRow, block) {
    const table = detailRow.querySelector("table");
    if (!table) return;

    table.addEventListener("click", async (e) => {
        const action = e.target?.dataset?.action;
        if (!action) return;

        const tr = e.target.closest(".sched-row");
        const id = tr?.dataset?.id;
        if (!id) return;

        if (action === "edit-row") {
            const r = (block.rows || []).find(x => String(x.id) === String(id));
            openEditRowModal(r);
            return;
        }

        if (action === "add-row") {
            try {
                // create duplicate row based on the clicked head row id
                const created = await fetchJson(API.duplicateRow, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ baseRowId: id })
                });

                // refresh and auto-open the new row (best-effort)
                await loadBlocks();
                const newId = created?.id;
                if (newId) {
                    const b = blocks.find(x => String(x.sectionCode) === String(block.sectionCode));
                    const r = (b?.rows || []).find(x => String(x.id) === String(newId));
                    if (r) openEditRowModal(r);
                }
            } catch (err) {
                console.error(err);
                appAlert(err.message || "Failed to add row.");
            }
            return;
        }

        if (action === "delete-row") {
            const r = (block.rows || []).find(x => String(x.id) === String(id));
            if (!r?.isDuplicateRow) {
                appAlert("Cannot delete base row.");
                return;
            }
            if (!confirm("Delete this added schedule row?")) return;

            try {
                await fetchJson(API.deleteRow(id), { method: "DELETE" });
                await loadBlocks();
            } catch (err) {
                console.error(err);
                appAlert(err.message || "Failed to delete row.");
            }
        }
    });
}

/* ===========================
   Edit row modal
=========================== */

function openEditRowModal(r) {
    if (!r) return;
    editScheduleId.value = r.id;
    editDay.value = r.dayOfWeek || "";
    // Ensure dropdowns are populated before selecting existing values.
    fillEditTimes();
    editStart.value = r.timeStart || "";
    updateEditEndTimes(r.timeEnd || null);
    editRoom.value = r.roomId || "";
    editTeacher.value = r.teacherId || "";
    if (editSuggestBox) editSuggestBox.textContent = "";
    editRowModal.classList.remove("hidden");
}

editCancelBtn.addEventListener("click", () => editRowModal.classList.add("hidden"));
editSuggestBtn?.addEventListener("click", suggestForEditModal);

editRowForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = editScheduleId.value;

    // Keep end options in sync with selected start.
    updateEditEndTimes(editEnd.value || null);

    // If one is set, require both (backend enforces too; this prevents confusing submissions).
    if ((editStart.value && !editEnd.value) || (!editStart.value && editEnd.value)) {
        appAlert("Please set both Time Start and Time End (or clear both).");
        return;
    }

    try {
        await fetchJson(API.updateRow(id), {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                day: editDay.value || null,
                startTime: editStart.value || null,
                endTime: editEnd.value || null,
                roomId: editRoom.value || null,
                teacherId: editTeacher.value || null,
            }),
        });

        editRowModal.classList.add("hidden");
        await loadBlocks();
    } catch (err) {
        console.error(err);
        appAlert(err.message || "Update failed.");
    }
});

/* ===========================
   Wizard: Create block
=========================== */

async function openWizard() {
    wizardForm.reset();
    populateProgramOptions();
    programSelect.value = "";
    curriculumSelect.value = "";
    yearSelect.value = "";
    termSelect.value = "";
    wizardModal.classList.remove("hidden");
    await loadActiveAcademicPeriod();
}

wizardCancelBtn.addEventListener("click", () => wizardModal.classList.add("hidden"));

programSelect.addEventListener("change", () => populateCurriculumOptions(programSelect.value));

wizardForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const courseCode = (programSelect.value || "").trim();
    const curriculumId = (curriculumSelect.value || "").trim();
    const year = parseInt(yearSelect.value, 10);
    const term = parseInt(termSelect.value, 10);

    if (!activeAcademicPeriod) await loadActiveAcademicPeriod();
    if (!activeAcademicPeriod) {
        appAlert("No active school year/term is configured. Please contact SUPER_ADMIN or ACADEMIC_HEAD.");
        return;
    }

    if (!courseCode || !curriculumId || !Number.isFinite(year) || !Number.isFinite(term)) {
        appAlert("Please complete Program, Curriculum, Year, and Term.");
        return;
    }

    try {
        await fetchJson(API.createBlock, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ courseCode, curriculumId, year, term }),
        });

        wizardModal.classList.add("hidden");
        await loadBlocks();
    } catch (err) {
        console.error(err);
        appAlert(err.message || "Failed to create block.");
    }
});

/* ===========================
   Buttons
=========================== */

refreshBtn.addEventListener("click", loadBlocks);

addBlockBtn.addEventListener("click", async () => {
    try {
        if (!curriculums.length) await loadCurriculums();
        openWizard();
    } catch (err) {
        console.error(err);
        appAlert(err.message || "Failed to load curriculum data.");
    }
});

/* ===========================
   Init
=========================== */

(async function init() {
    ensureAddRowStyles();
    await loadSearchComponent();
    await Promise.all([loadRoomsTeachers(), loadCurriculums(), loadActiveAcademicPeriod(), loadSchoolHoursConfig()]);
    initHeaderSort();
    await loadBlocks();

    fillEditTimes();
    editStart?.addEventListener("change", () => updateEditEndTimes(null));
})();
