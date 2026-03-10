const API = {
  blocks: "/api/scheduler/jhs/blocks",
  createBlock: "/api/scheduler/jhs/blocks",
  deleteBlock: (section) => `/api/scheduler/jhs/blocks/${encodeURIComponent(section)}`,
  dupRow: "/api/scheduler/jhs/rows",
  delRow: (id) => `/api/scheduler/jhs/rows/${id}`,
  updRow: (id) => `/api/scheduler/jhs/rows/${id}`,

  rooms: "/api/settings/rooms",
  teachers: "/api/settings/teachers",
  settingsCurriculums: "/api/settings/curriculums",
};

const token = localStorage.getItem("token");
function authHeaders() {
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

const blocksBody = document.querySelector("#blocksTable tbody");
const refreshBtn = document.getElementById("refreshBtn");
const addBtn = document.getElementById("openWizardBtn");
let searchInput = null;

// wizard modal (create block)
const wizardModal = document.getElementById("wizardModal");
const wizardForm = document.getElementById("wizardForm");
const wizardCancelBtn = document.getElementById("wizardCancelBtn");
const programSelect = document.getElementById("programSelect");
const curriculumSelect = document.getElementById("curriculumSelect");
const gradeSelect = document.getElementById("gradeSelect");
const sectionNameInput = document.getElementById("sectionNameInput");

// edit row modal
const editRowModal = document.getElementById("editRowModal");
const editRowForm = document.getElementById("editRowForm");
const editRowMeta = document.getElementById("editRowMeta");
const editScheduleId = document.getElementById("editScheduleId");
const editDay = document.getElementById("editDay");
const editStart = document.getElementById("editStart");
const editEnd = document.getElementById("editEnd");
const editRoom = document.getElementById("editRoom");
const editInstructor = document.getElementById("editInstructor");
const editSuggestBtn = document.getElementById("editSuggestBtn");
const editSuggestBox = document.getElementById("editSuggestBox");
const editCancelBtn = document.getElementById("editCancelBtn");

let blocks = [];
let openSection = null;
let curriculums = [];
let rooms = [];
let teachers = [];
let sortKey = "grade";
let sortDir = "asc";

// Time policy for the schedule grid (must match backend ScheduleTimePolicy)
const TIME_POLICY = {
  startMin: "07:00",
  startMax: "20:30",
  endMax: "21:00",
  stepMinutes: 30,
  allowedDurations: [60, 90, 120, 180],
};

async function fetchJson(url, options) {
  const res = await fetch(url, {
    ...(options || {}),
    headers: {
      ...authHeaders(),
      ...((options || {}).headers || {}),
    },
  });
  const txt = await res.text();
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { if (txt) msg = (JSON.parse(txt)?.message || msg); } catch { if (txt) msg = txt; }
    throw new Error(msg);
  }

  if (!txt) return null;
  return ct.includes("application/json") ? JSON.parse(txt) : txt;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ICONS = {
  edit: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.95l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l8.06-8.06.92.92L5.92 19.58zM20.7 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75L20.7 7.04z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9zM7 9h2v10H7V9zm-1 14h12a2 2 0 0 0 2-2V7H4v14a2 2 0 0 0 2 2z"/></svg>`,
  view: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>`,
};

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

  // Default tie-breakers: grade -> section
  const g1 = normalizeSortVal(a?.grade);
  const g2 = normalizeSortVal(b?.grade);
  if (g1 < g2) return -1;
  if (g1 > g2) return 1;

  return String(a?.section || "").localeCompare(String(b?.section || ""));
}

function updateSortUI() {
  const table = document.getElementById("blocksTable");
  if (!table) return;
  table.querySelectorAll("thead th[data-key]").forEach((th) => {
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

  // Default: grade sort
  sortKey = "grade";
  sortDir = "asc";
  updateSortUI();
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

function shortDay(day) {
  const d = String(day || "").toUpperCase();
  if (!d) return "\u2014";
  if (d.startsWith("MON")) return "MON";
  if (d.startsWith("TUE")) return "TUE";
  if (d.startsWith("WED")) return "WED";
  if (d.startsWith("THU")) return "THU";
  if (d.startsWith("FRI")) return "FRI";
  if (d.startsWith("SAT")) return "SAT";
  if (d.startsWith("SUN")) return "SUN";
  return d.slice(0, 3);
}

function timeRange(s, e) {
  if (!s || !e) return "\u2014";
  return `${s} - ${e}`;
}

function roomLabel(r) {
  if (!r) return "";
  return String(r.code || r.roomCode || r.name || r.id || "").trim();
}

function teacherLabel(t) {
  if (!t) return "";
  const dept = String(t.department || "").trim();
  const last = String(t.lastName || "").trim();
  const first = String(t.firstName || "").trim();
  const full = String(t.name || t.fullName || "").trim();
  return (`${dept} ${last}`.trim()) || (`${first} ${last}`.trim()) || full || String(t.email || "").trim() || String(t.id || "");
}

function getRoomLabel(roomId) {
  if (!roomId) return "\u2014";
  const r = rooms.find(x => String(x.id) === String(roomId));
  return r ? (roomLabel(r) || r.id) : "\u2014";
}

function getTeacherLabel(teacherId) {
  if (!teacherId) return "\u2014";
  const t = teachers.find(x => String(x.id) === String(teacherId));
  return t ? (teacherLabel(t) || t.id) : "\u2014";
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

function overlaps(sm, em, sm2, em2) {
  return sm < em2 && sm2 < em;
}

function flattenScheduledRows() {
  const out = [];
  (blocks || []).forEach((b) => {
    const sectionKey = String(b?.section || b?.sectionCode || "").trim();
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
    const sectionKey = String(b?.section || b?.sectionCode || "").trim();
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
      if (!res.ok) return [];
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
    } catch (_) {
      return [];
    }
  }));

  return results.flat();
}

async function suggestForEditModal() {
  if (!editSuggestBox) return;
  editSuggestBox.textContent = "";

  const schedId = String(editScheduleId?.value || "").trim();
  const selectedTeacherId = String(editInstructor?.value || "").trim();
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
    duration = TIME_POLICY.allowedDurations
      .slice()
      .sort((a, b) => Math.abs(a - duration) - Math.abs(b - duration))[0];
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

  const roomPref = String(editRoom?.value || "").trim();
  const roomCandidates = (rooms || [])
    .slice()
    .sort((a, b) => String(a.code || a.name || "").localeCompare(String(b.code || b.name || "")));
  if (roomPref) {
    const idx = roomCandidates.findIndex((r) => String(r?.id || "") === roomPref);
    if (idx > 0) roomCandidates.unshift(roomCandidates.splice(idx, 1)[0]);
  }

  for (const day of dayCandidates) {
    const teacherBusy = allRows.filter((r) => r.day === day && r.teacherId === selectedTeacherId);
    const sectionBusy = allRows.filter((r) => r.day === day && r.sectionKey === sectionKey);

    for (const start of startCandidates) {
      const sm = hhmmToMinutes(start);
      if (sm == null) continue;
      const em = sm + duration;

      if (teacherBusy.some((x) => overlaps(sm, em, x.sm, x.em))) continue;
      if (sectionBusy.some((x) => overlaps(sm, em, x.sm, x.em))) continue;

      const freeRoom = roomCandidates.find((rm) => {
        const rid = String(rm?.id || "");
        if (!rid) return false;
        return !allRows.some((x) => x.day === day && x.roomId === rid && overlaps(sm, em, x.sm, x.em));
      });
      if (!freeRoom) continue;

      const endHHMM = minutesToHHMM(em);
      if (editDay) editDay.value = day;
      if (editStart) editStart.value = start;
      updateEditEndTimes(endHHMM);
      if (editEnd) editEnd.value = endHHMM;
      if (editRoom) editRoom.value = String(freeRoom.id);

      editSuggestBox.textContent =
        `Suggested for Instructor + Section:\n` +
        `Day/Time: ${day} ${start}-${endHHMM}\n` +
        `Room: ${String(freeRoom.code || freeRoom.name || "").trim() || "—"}`;
      return;
    }
  }

  editSuggestBox.textContent = "No available Day/Time/Room found that fits both the Instructor and the Section.";
}

function buildHalfHourRange(fromHHMM, toHHMM) {
  const from = hhmmToMinutes(fromHHMM);
  const to = hhmmToMinutes(toHHMM);
  if (from == null || to == null || to < from) return [];
  const out = [];
  for (let m = from; m <= to; m += TIME_POLICY.stepMinutes) out.push(minutesToHHMM(m));
  return out;
}

function buildEndTimesForStart(startHHMM) {
  const start = hhmmToMinutes(startHHMM);
  const endMax = hhmmToMinutes(TIME_POLICY.endMax);
  if (start == null || endMax == null) return [];

  const ends = TIME_POLICY.allowedDurations
    .map(d => start + d)
    .filter(end => end <= endMax)
    .map(minutesToHHMM);

  return [...new Set(ends)].sort((a, b) => (hhmmToMinutes(a) ?? 0) - (hhmmToMinutes(b) ?? 0));
}

function fillEditStartTimes() {
  // Start times: only those that can produce at least one acceptable end time.
  const starts = buildHalfHourRange(TIME_POLICY.startMin, TIME_POLICY.startMax)
    .filter(s => buildEndTimesForStart(s).length > 0);

  editStart.innerHTML =
    `<option value="">(Unset)</option>` +
    starts.map(t => `<option value="${t}">${t}</option>`).join("");
}

function updateEditEndTimes(preferredEnd) {
  const start = (editStart.value || "").trim();
  const options = start ? buildEndTimesForStart(start) : [];

  editEnd.innerHTML =
    `<option value="">(Unset)</option>` +
    options.map(t => `<option value="${t}">${t}</option>`).join("");

  if (preferredEnd && options.includes(preferredEnd)) editEnd.value = preferredEnd;
  else editEnd.value = "";
}

function filterJhsCurriculums(list) {
  return (list || []).filter(c =>
    c &&
    c.active !== false &&
    String(c.dept || "").toUpperCase() === "JHS"
  );
}

function populatePrograms() {
  const byProgram = new Map();
  (curriculums || []).forEach(c => {
    const p = String(c.courseCode || "").trim();
    if (!p) return;
    if (!byProgram.has(p)) byProgram.set(p, []);
    byProgram.get(p).push(c);
  });

  const programs = [...byProgram.keys()].sort();
  programSelect.innerHTML = `<option value="" disabled selected>Select Program</option>` +
    programs.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
}

function populateCurriculums(programCode) {
  const list = (curriculums || [])
    .filter(c => String(c.courseCode || "") === String(programCode || ""))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  curriculumSelect.innerHTML = `<option value="" disabled selected>Select Curriculum</option>` +
    list.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
}

function openWizard() {
  if (!wizardModal) return;
  wizardModal.classList.remove("hidden");
}

function closeWizard() {
  if (!wizardModal) return;
  wizardModal.classList.add("hidden");
  wizardForm?.reset?.();
}

function fillRoomsTeachers() {
  editRoom.innerHTML =
    `<option value="">(Unset)</option>` +
    (rooms || []).map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(roomLabel(r) || r.id)}</option>`).join("");

  editInstructor.innerHTML =
    `<option value="">(Unset)</option>` +
    (teachers || []).map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(teacherLabel(t) || t.id)}</option>`).join("");
}

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

async function loadLookups() {
  try {
    const list = await fetchJson(API.settingsCurriculums);
    curriculums = filterJhsCurriculums(list || []);
  } catch (e) {
    console.warn("load curriculums failed:", e);
    curriculums = [];
  }

  populatePrograms();
  populateCurriculums(programSelect?.value || "");

  try {
    const raw = (await fetchJson(API.rooms)) || [];
    rooms = raw.map(r => ({ ...r, code: r.code || r.roomCode || r.name || "" }));
  } catch (e) {
    console.warn("load rooms failed:", e);
    rooms = [];
  }

  try {
    const raw = (await fetchJson(API.teachers)) || [];

    const normRole = (v) => String(v || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/-/g, "_");
    const disallowed = new Set(["CHECKER", "NON_TEACHING"]);

    teachers = raw
      .filter(t => !disallowed.has(normRole(t?.role)))
      .map(t => ({ ...t }));
  } catch (e) {
    console.warn("load teachers failed:", e);
    teachers = [];
  }

  fillRoomsTeachers();
}

function renderBlocks() {
  const q = (searchInput?.value || "").trim().toLowerCase();
  const list = (!q ? blocks : blocks.filter(b => String(b.section || "").toLowerCase().includes(q)))
    .slice()
    .sort(compareBlocks);

  blocksBody.innerHTML = "";

  if (!list.length) {
    blocksBody.innerHTML = `<tr><td colspan="5">No blocks found.</td></tr>`;
    return;
  }

  for (const b of list) {
    const tr = document.createElement("tr");
    tr.dataset.section = b.section;
    tr.innerHTML = `
      <td>
        <div style="font-weight:600;">${escapeHtml(b.section)}</div>
        <div style="font-size:12px;opacity:.8;">${escapeHtml(b.curriculumName || "")}</div>
      </td>
      <td>${escapeHtml(b.program || "")}</td>
      <td>${escapeHtml(b.grade)}</td>
      <td>${escapeHtml(b.status || "Active")}</td>
      <td>
        <div style="display:flex;gap:8px;justify-content:center;">
          <button class="btn btn-secondary btn-icon" data-action="view" data-section="${escapeHtml(b.section)}" title="View" aria-label="View">${ICONS.view}</button>
          <button class="btn btn-delete btn-icon" data-action="delete" data-section="${escapeHtml(b.section)}" title="Delete" aria-label="Delete">${ICONS.trash}</button>
        </div>
      </td>
    `;
    blocksBody.appendChild(tr);
  }
}

function renderScheduleBlockTable(block) {
  const rows = block.rows || [];
  const sectionRowspan = rows.length || 1;

  const sectionCell = `
    <div style="text-transform:uppercase;font-weight:600;">${escapeHtml(block.section || "")}</div>
    <div style="font-size:12px;opacity:.85;">${escapeHtml(block.curriculumName || "")}</div>
  `;

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
      <td style="padding:10px;border:1px solid #666;text-align:center;">${escapeHtml(getRoomLabel(r.roomId))}</td>
      <td style="padding:10px;border:1px solid #666;text-align:center;">${escapeHtml(getTeacherLabel(r.teacherId))}</td>
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
  detailRow.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const action = el.dataset.action;
    const rowEl = e.target.closest("tr[data-id]");
    const rowId = rowEl?.dataset?.id;

    if (action === "add-row") {
      if (!rowId) return;
      await fetchJson(API.dupRow, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRowId: rowId })
      });
      await loadBlocks();
      return;
    }

    if (action === "delete-row") {
      if (!rowId) return;
      if (!confirm("Delete this added row?")) return;
      await fetchJson(API.delRow(rowId), { method: "DELETE" });
      await loadBlocks();
      return;
    }

    if (action === "edit-row") {
      if (!rowId) return;
      openEditRowModal(block, rowId);
    }
  });
}

function openEditRowModal(block, rowId) {
  const row = (block.rows || []).find(r => String(r.id) === String(rowId));
  if (!row) return;

  editScheduleId.value = row.id;
  editRowMeta.textContent = `${row.subjectCode || ""} ${row.subjectName || ""}`.trim();

  editDay.value = row.dayOfWeek || "";
  fillEditStartTimes();
  editStart.value = row.timeStart || "";
  updateEditEndTimes(row.timeEnd || null);

  editRoom.value = row.roomId || "";
  editInstructor.value = row.teacherId || "";
  if (editSuggestBox) editSuggestBox.textContent = "";

  editRowModal.classList.remove("hidden");
}

async function loadBlocks() {
  blocks = (await fetchJson(API.blocks)) || [];

  // Frontend guard: only show blocks created under JHS curriculums.
  if (curriculums?.length) {
    const allowedPrograms = new Set(
      curriculums
        .map(c => String(c.courseCode || "").trim())
        .filter(Boolean)
    );
    if (allowedPrograms.size) {
      blocks = blocks.filter(b => allowedPrograms.has(String(b.program || "").trim()));
    }
  }

  renderBlocks();

  if (openSection) {
    const row = [...blocksBody.querySelectorAll("tr")].find(r => r.dataset.section === openSection);
    const blk = blocks.find(b => b.section === openSection);
    if (row && blk) {
      const detail = document.createElement("tr");
      detail.className = "detail-row";
      const td = document.createElement("td");
      td.colSpan = 5;
      td.innerHTML = renderScheduleBlockTable(blk);
      detail.appendChild(td);
      row.after(detail);
      bindScheduleBlockHandlers(detail, blk);
    }
  }
}

refreshBtn?.addEventListener("click", loadBlocks);
addBtn?.addEventListener("click", openWizard);
wizardCancelBtn?.addEventListener("click", closeWizard);
programSelect?.addEventListener("change", () => populateCurriculums(programSelect.value));

blocksBody?.addEventListener("click", async (e) => {
  const viewBtn = e.target.closest("[data-action='view']");
  const delBtn = e.target.closest("[data-action='delete']");

  if (delBtn) {
    const section = delBtn.dataset.section;
    if (!section) return;
    if (!confirm(`Delete schedule block ${section}?`)) return;
    await fetchJson(API.deleteBlock(section), { method: "DELETE" });
    openSection = null;
    await loadBlocks();
    return;
  }

  if (!viewBtn) return;

  const section = viewBtn.dataset.section;
  const tr = viewBtn.closest("tr");
  const existing = tr.nextElementSibling;

  if (existing && existing.classList.contains("detail-row")) {
    existing.remove();
    openSection = null;
    return;
  }

  document.querySelectorAll(".detail-row").forEach(x => x.remove());

  const block = blocks.find(b => String(b.section) === String(section));
  if (!block) return;

  const detail = document.createElement("tr");
  detail.className = "detail-row";
  const td = document.createElement("td");
  td.colSpan = 5;
  td.innerHTML = renderScheduleBlockTable(block);
  detail.appendChild(td);

  tr.after(detail);
  openSection = section;
  bindScheduleBlockHandlers(detail, block);
});

wizardForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const curriculumId = (curriculumSelect.value || "").trim();
  const grade = parseInt(gradeSelect.value, 10);
  const sectionName = (sectionNameInput.value || "").trim();

  if (!curriculumId || !Number.isFinite(grade) || !sectionName) {
    appAlert("Please complete Program, Curriculum, Grade, and Section Name.");
    return;
  }

  try {
    await fetchJson(API.createBlock, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ curriculumId, grade, sectionName })
    });
    closeWizard();
    await loadBlocks();
  } catch (err) {
    appAlert(err.message || "Failed to create block.");
  }
});

editCancelBtn?.addEventListener("click", () => editRowModal.classList.add("hidden"));
editSuggestBtn?.addEventListener("click", suggestForEditModal);
editStart?.addEventListener("change", () => updateEditEndTimes(null));

editRowForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = (editScheduleId.value || "").trim();
  if (!id) return;

  // If one is set, require both.
  if ((editStart.value && !editEnd.value) || (!editStart.value && editEnd.value)) {
    appAlert("Please set both Time Start and Time End (or clear both).");
    return;
  }

  try {
    await fetchJson(API.updRow(id), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day: editDay.value || null,
        startTime: editStart.value || null,
        endTime: editEnd.value || null,
        roomId: editRoom.value || null,
        teacherId: editInstructor.value || null,
      }),
    });
    editRowModal.classList.add("hidden");
    await loadBlocks();
  } catch (err) {
    appAlert(err.message || "Update failed.");
  }
});

(async function init() {
  ensureAddRowStyles();
  fillEditStartTimes();
  updateEditEndTimes(null);
  await loadSearchComponent();
  await loadLookups();
  initHeaderSort();
  await loadBlocks();
})();
