
/* =============================================================================================
   SHS SCHEDULER (DB-backed)
   - Blocks list (from backend)
   - View expands to show subject schedules
   - Edit modal updates row
   - Add Row (+) duplicates base row (optional)
   - Delete only duplicate rows

   API base: /api/scheduler/shs
============================================================================================= */

const API = {
  blocks: "/api/scheduler/shs/blocks",
  createBlock: "/api/scheduler/shs/blocks",
  deleteBlock: (sectionCode) => `/api/scheduler/shs/blocks/${encodeURIComponent(sectionCode)}`,
  dupRow: "/api/scheduler/shs/rows",
  delRow: (id) => `/api/scheduler/shs/rows/${id}`,
  updRow: (id) => `/api/scheduler/shs/rows/${id}`,
  courses: "/api/settings/courses",
  curriculums: "/api/settings/curriculums",
  rooms: "/api/settings/rooms",
  teachers: "/api/settings/teachers",
  academicPeriod: "/api/settings/academic-period/current",
  schoolHoursActive: "/api/settings/school-hours/active",
};

const token = localStorage.getItem("token");

function authHeaders() {
  return {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });

  const txt = await res.text();
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { if (txt) msg = (JSON.parse(txt)?.message || msg); } catch { if (txt) msg = txt; }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204 || !txt) return null;
  if (ct.includes("application/json")) return JSON.parse(txt);
  return txt;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
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

  // Default tie-breakers: program -> grade -> term -> section
  const p1 = normalizeSortVal(a?.courseCode);
  const p2 = normalizeSortVal(b?.courseCode);
  if (p1 < p2) return -1;
  if (p1 > p2) return 1;

  const g1 = normalizeSortVal(a?.year);
  const g2 = normalizeSortVal(b?.year);
  if (g1 < g2) return -1;
  if (g1 > g2) return 1;

  const t1 = normalizeSortVal(a?.term);
  const t2 = normalizeSortVal(b?.term);
  if (t1 < t2) return -1;
  if (t1 > t2) return 1;

  return String(a?.sectionCode || "").localeCompare(String(b?.sectionCode || ""));
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

  // Default: program then grade
  sortKey = "courseCode";
  sortDir = "asc";
  updateSortUI();
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

let blocks = [];
let openSectionCode = null;
let rooms = [];
let teachers = [];
let courses = [];
let curriculums = [];
let sortKey = "courseCode";
let sortDir = "asc";
let activeAcademicPeriod = null;

const blocksBody = document.querySelector("#blocksTable tbody");
let searchInput = null;
const refreshBtn = document.getElementById("refreshBtn");
const addBtn = document.getElementById("addScheduleBtn");

const wizardModal = document.getElementById("wizardModal");
const wizardForm = document.getElementById("wizardForm");
const wizardCancelBtn = document.getElementById("wizardCancelBtn");
const programSelect = document.getElementById("programSelect");
const curriculumSelect = document.getElementById("curriculumSelect");
const yearSelect = document.getElementById("yearSelect");
const termSelect = document.getElementById("termSelect");

const editModal = document.getElementById("editRowModal");
const editForm = document.getElementById("editRowForm");
const editCancelBtn = document.getElementById("editCancelBtn");

const daySelect = document.getElementById("daySelect");
const timeStartSelect = document.getElementById("timeStartSelect");
const timeEndSelect = document.getElementById("timeEndSelect");
const roomSelect = document.getElementById("roomSelect");
const instructorSelect = document.getElementById("instructorSelect");
const editSuggestBtn = document.getElementById("editSuggestBtn");
const editSuggestBox = document.getElementById("editSuggestBox");

let editingRowId = null;

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
  return d.slice(0,3);
}

function timeRange(s, e) {
  if (!s || !e) return "\u2014";
  return `${s} - ${e}`;
}

function getRoomLabel(roomId) {
  if (!roomId) return "\u2014";
  const r = rooms.find(x => x.id === roomId);
  return r ? (r.code || r.roomCode || r.name || r.id) : "\u2014";
}

function teacherLabel(t) {
  if (!t) return "";
  const dept = String(t.department || "").trim();
  const last = String(t.lastName || "").trim();
  const first = String(t.firstName || "").trim();
  const full = String(t.name || t.fullName || "").trim();
  return (`${dept} ${last}`.trim()) || (`${first} ${last}`.trim()) || full || String(t.email || "").trim() || String(t.id || "");
}

function getTeacherLabel(teacherId) {
  if (!teacherId) return "\u2014";
  const t = teachers.find(x => x.id === teacherId);
  return t ? (teacherLabel(t) || t.id) : "\u2014";
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

function populateProgramOptions() {
  programSelect.innerHTML = `<option value="">Select Program</option>`;
  courses.forEach(c => {
    programSelect.innerHTML += `<option value="${escapeHtml(c.code)}">${escapeHtml(c.code)}</option>`;
  });
}

function populateCurriculumOptions(courseCode) {
  curriculumSelect.innerHTML = `<option value="">Select Curriculum</option>`;
  curriculums
    .filter(c => c.courseCode === courseCode && c.dept === "SHS" && c.active !== false)
    .forEach(c => {
      curriculumSelect.innerHTML += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`;
    });
}

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
    termSelect.value = "";
    termSelect.disabled = true;
    if (submit) submit.disabled = true;
    return;
  }
  const currentTerm = String(activeAcademicPeriod.term);
  termSelect.innerHTML = "";
  const currentTermOption = document.createElement("option");
  currentTermOption.value = currentTerm;
  currentTermOption.textContent = currentTerm;
  termSelect.appendChild(currentTermOption);
  termSelect.value = currentTerm;
  termSelect.disabled = true;
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


async function openWizard() {
  wizardForm.reset();
  populateProgramOptions();
  wizardModal.classList.remove("hidden");
  await loadActiveAcademicPeriod();
}

wizardCancelBtn?.addEventListener("click", () => wizardModal.classList.add("hidden"));
programSelect?.addEventListener("change", () => populateCurriculumOptions(programSelect.value));
addBtn?.addEventListener("click", openWizard);

wizardForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const courseCode = (programSelect.value || "").trim();
  const curriculumId = (curriculumSelect.value || "").trim();
  const year = parseInt(yearSelect.value, 10);

  if (!activeAcademicPeriod) await loadActiveAcademicPeriod();
  if (!activeAcademicPeriod) {
    appAlert("No active school year/term is configured. Please contact SUPER_ADMIN or ACADEMIC_HEAD.");
    return;
  }
  const term = parseInt(activeAcademicPeriod.term, 10);

  if (!courseCode || !curriculumId || !Number.isFinite(year) || !Number.isFinite(term)) {
    appAlert("Please complete Program, Curriculum, Year/Grade, and Term.");
    return;
  }

  try {
    await fetchJson(API.createBlock, {
      method: "POST",
      body: JSON.stringify({ courseCode, curriculumId, grade: year, term })
    });
    wizardModal.classList.add("hidden");
    await loadBlocks();
  } catch (err) {
    appAlert(err.message || "Failed to create block");
  }
});

function renderBlocks() {
  const q = (searchInput?.value || "").trim().toLowerCase();
  const list = (!q ? blocks : blocks.filter(b =>
    String(b.sectionCode || "").toLowerCase().includes(q)
  )).slice().sort(compareBlocks);

  blocksBody.innerHTML = "";

  if (!list.length) {
    blocksBody.innerHTML = `<tr><td colspan="6">No schedules found.</td></tr>`;
    return;
  }

  list.forEach(b => {
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
}

function renderScheduleBlockTable(block) {
  const rows = block.rows || [];
  const sectionRowspan = rows.length || 1;

  const sectionCell = `
    <div style="text-transform:uppercase;font-weight:600;">${escapeHtml(block.sectionCode || "")}</div>
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
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const rowEl = e.target.closest("tr[data-id]");
    const rowId = rowEl?.dataset?.id;

    if (action === "edit-row") {
      if (!rowId) return;
      openEditModal(block, rowId);
      return;
    }

    if (action === "add-row") {
      if (!rowId) return;
      try {
        await fetchJson(API.dupRow, {
          method: "POST",
          body: JSON.stringify({ baseRowId: rowId })
        });
        await loadBlocks();
      } catch (err) {
        appAlert(err.message || "Failed to add row");
      }
      return;
    }

    if (action === "delete-row") {
      if (!rowId) return;
      if (!confirm("Delete this added row?")) return;
      try {
        await fetchJson(API.delRow(rowId), { method: "DELETE" });
        await loadBlocks();
      } catch (err) {
        appAlert(err.message || "Failed to delete row");
      }
      return;
    }
  });
}

function openEditModal(block, rowId) {
  const row = (block.rows || []).find(r => r.id === rowId);
  if (!row) return;

  editingRowId = rowId;

  daySelect.value = row.dayOfWeek || "";
  timeStartSelect.value = row.timeStart || "";
  updateEndTimes(row.timeEnd || null);
  roomSelect.value = row.roomId || "";
  instructorSelect.value = row.teacherId || "";
  if (editSuggestBox) editSuggestBox.textContent = "";

  editModal.classList.remove("hidden");
}

editCancelBtn?.addEventListener("click", () => {
  editModal.classList.add("hidden");
  editingRowId = null;
});

editSuggestBtn?.addEventListener("click", suggestForEditModal);

editForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!editingRowId) return;

  const payload = {
    day: daySelect.value || null,
    startTime: timeStartSelect.value || null,
    endTime: timeEndSelect.value || null,
    roomId: roomSelect.value || null,
    teacherId: instructorSelect.value || null,
  };

  try {
    await fetchJson(API.updRow(editingRowId), {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    editModal.classList.add("hidden");
    editingRowId = null;
    await loadBlocks();
  } catch (err) {
    appAlert(err.message || "Failed to update row");
  }
});

blocksBody?.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const section = btn.dataset.section;
  const tr = btn.closest("tr");

  if (action === "delete") {
    if (!confirm(`Delete block ${section}?`)) return;
    try {
      await fetchJson(API.deleteBlock(section), { method: "DELETE" });
      openSectionCode = null;
      await loadBlocks();
    } catch (err) {
      appAlert(err.message || "Failed to delete block");
    }
    return;
  }

  if (action !== "view") return;

  const existing = tr.nextElementSibling;
  if (existing && existing.classList.contains("detail-row")) {
    existing.remove();
    openSectionCode = null;
    return;
  }

  document.querySelectorAll(".detail-row").forEach(x => x.remove());

  const block = blocks.find(b => b.sectionCode === section);
  if (!block) return;

  const detail = document.createElement("tr");
  detail.className = "detail-row";
  const td = document.createElement("td");
  td.colSpan = 6;
  td.innerHTML = renderScheduleBlockTable(block);
  detail.appendChild(td);
  tr.after(detail);

  openSectionCode = section;
  bindScheduleBlockHandlers(detail, block);
});

function fillRooms() {
  roomSelect.innerHTML = `<option value="">(Unset)</option>`;
  rooms.forEach(r => {
    const label = r.code || r.roomCode || r.name || r.id;
    roomSelect.innerHTML += `<option value="${escapeHtml(r.id)}">${escapeHtml(label)}</option>`;
  });
}

function fillTeachers() {
  instructorSelect.innerHTML = `<option value="">(Unset)</option>`;
  teachers.forEach(t => {
    const label = teacherLabel(t) || t.id;
    instructorSelect.innerHTML += `<option value="${escapeHtml(t.id)}">${escapeHtml(label)}</option>`;
  });
}


// Time policy for the schedule grid (must match backend ScheduleTimePolicy)
let TIME_POLICY = {
  startMin: "07:00",
  startMax: "20:30",
  endMax: "21:00",
  stepMinutes: 30,
  allowedDurations: [60, 90, 120, 180],
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
    // Keep default fallback policy when settings endpoint is unavailable.
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

  const schedId = String(editingRowId || "").trim();

  const selectedTeacherId = String(instructorSelect?.value || "").trim();
  if (!selectedTeacherId) {
    editSuggestBox.textContent = "Select an Instructor first.";
    return;
  }

  const sectionKey = findSectionKeyForRowId(schedId);
  if (!sectionKey) {
    editSuggestBox.textContent = "Missing section context for this row.";
    return;
  }

  const dayPref = String(daySelect?.value || "").trim().toUpperCase();
  const startPref = String(timeStartSelect?.value || "").trim();
  const endPref = String(timeEndSelect?.value || "").trim();

  let duration = TIME_POLICY.allowedDurations?.[0] || 60;
  const smPref = startPref ? hhmmToMinutes(startPref) : null;
  const emPref = endPref ? hhmmToMinutes(endPref) : null;
  if (smPref != null && emPref != null && emPref > smPref) duration = emPref - smPref;
  if (!TIME_POLICY.allowedDurations.includes(duration)) {
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

  const roomPref = String(roomSelect?.value || "").trim();
  const roomCandidates = (rooms || [])
    .slice()
    .sort((a, b) => String(a.code || a.name || "").localeCompare(String(b.code || b.name || "")));
  if (roomPref) {
    const idx = roomCandidates.findIndex((r) => String(r?.id || "") === roomPref);
    if (idx > 0) roomCandidates.unshift(roomCandidates.splice(idx, 1)[0]);
  }

  const roomBlockedHints = [];

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
      if (!freeRoom) {
            if (roomBlockedHints.length < 3) roomBlockedHints.push(`${day} ${start}-${minutesToHHMM(em)}`);
            continue;
        }

      const endHHMM = minutesToHHMM(em);
      if (daySelect) daySelect.value = day;
      if (timeStartSelect) timeStartSelect.value = start;
      updateEndTimes(endHHMM);
      if (timeEndSelect) timeEndSelect.value = endHHMM;
      if (roomSelect) roomSelect.value = String(freeRoom.id);

      editSuggestBox.textContent =
        `Suggested for Instructor + Section:\n` +
        `Day/Time: ${day} ${start}-${endHHMM}\n` +
        `Room: ${String(freeRoom.code || freeRoom.name || "").trim() || "—"}`;
      return;
    }
  }

  editSuggestBox.textContent = "No available Day/Time/Room found that fits both the Instructor and the Section." +
        (roomBlockedHints.length ? `\nClosest time options blocked by room conflicts: ${roomBlockedHints.join(", ")}` : "");
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

function updateEndTimes(preferredEnd = null) {
  if (!timeEndSelect) return;

  const start = (timeStartSelect?.value || "").trim();
  const options = start ? buildEndTimesForStart(start) : [];

  timeEndSelect.innerHTML =
    `<option value="">(Unset)</option>` +
    options.map(t => `<option value="${t}">${t}</option>`).join("");

  if (preferredEnd && options.includes(preferredEnd)) timeEndSelect.value = preferredEnd;
  else timeEndSelect.value = "";
}

function fillTimes() {
  // Start times: only those that can produce at least one acceptable end time.
  // (e.g. if endMax is 21:00 and min duration is 60 mins, 20:30 should not appear.)
  const starts = buildHalfHourRange(TIME_POLICY.startMin, TIME_POLICY.startMax)
    .filter(s => buildEndTimesForStart(s).length > 0);
  if (timeStartSelect) {
    timeStartSelect.innerHTML =
      `<option value="">(Unset)</option>` +
      starts.map(t => `<option value="${t}">${t}</option>`).join("");
  }
  updateEndTimes(null);
}

async function loadLookups() {
  try { courses = (await fetchJson(API.courses)) || []; } catch (e) { console.warn("load courses failed:", e); courses = []; }
  try { curriculums = (await fetchJson(API.curriculums)) || []; } catch (e) { console.warn("load curriculums failed:", e); curriculums = []; }
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
    const disallowed = new Set(["CHECKER", "NON_TEACHING", "STAFF"]);

    teachers = raw
      .filter(t => !disallowed.has(normRole(t?.role)) && !isStaffDepartment(t?.department))
      .map(t => ({ ...t }));
  } catch (e) {
    console.warn("load teachers failed:", e);
    teachers = [];
  }

  fillRooms();
  fillTeachers();
}

async function loadBlocks() {
  blocks = (await fetchJson(API.blocks)) || [];

  // Frontend guard: only show blocks created for SHS curriculums.
  const allowedCurriculumIds = new Set(
    (curriculums || [])
      .filter(c => c && c.active !== false && c.dept === "SHS")
      .map(c => String(c.id || "").trim())
      .filter(Boolean)
  );
  if (allowedCurriculumIds.size) {
    blocks = (blocks || []).filter(b => b && b.curriculumId && allowedCurriculumIds.has(String(b.curriculumId)));
  }

  renderBlocks();

  // re-open expanded
  if (openSectionCode) {
    const row = [...blocksBody.querySelectorAll("tr")].find(r => r.dataset.section === openSectionCode);
    const blk = blocks.find(b => b.sectionCode === openSectionCode);
    if (row && blk) {
      const detail = document.createElement("tr");
      detail.className = "detail-row";
      const td = document.createElement("td");
      td.colSpan = 6;
      td.innerHTML = renderScheduleBlockTable(blk);
      detail.appendChild(td);
      row.after(detail);
      bindScheduleBlockHandlers(detail, blk);
    }
  }
}

refreshBtn?.addEventListener("click", loadBlocks);

(async function init() {
  ensureAddRowStyles();
  await loadSchoolHoursConfig();
  fillTimes();
  timeStartSelect?.addEventListener("change", () => updateEndTimes(null));
  await loadSearchComponent();
  await loadLookups();
  initHeaderSort();
  await loadBlocks();
})();

