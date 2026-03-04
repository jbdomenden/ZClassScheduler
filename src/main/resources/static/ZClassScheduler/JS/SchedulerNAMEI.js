
/* =============================================================================================
   NAMEI TERTIARY SCHEDULER (DB-backed)
   - Blocks list (from backend)
   - View expands to show subject schedules
   - Edit modal updates row
   - Add Row (+) duplicates base row (optional)
   - Delete only duplicate rows

   API base: /api/scheduler/namei
============================================================================================= */

const API = {
  blocks: "/api/scheduler/namei/blocks",
  createBlock: "/api/scheduler/namei/blocks",
  deleteBlock: (sectionCode) => `/api/scheduler/namei/blocks/${encodeURIComponent(sectionCode)}`,
  dupRow: "/api/scheduler/namei/rows",
  delRow: (id) => `/api/scheduler/namei/rows/${id}`,
  updRow: (id) => `/api/scheduler/namei/rows/${id}`,
  courses: "/api/settings/courses",
  curriculums: "/api/settings/curriculums",
  rooms: "/api/settings/rooms",
  teachers: "/api/settings/teachers",
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

let blocks = [];
let openSectionCode = null;
let rooms = [];
let teachers = [];
let courses = [];
let curriculums = [];

const blocksBody = document.querySelector("#blocksTable tbody");
const searchInput = document.getElementById("searchInput");
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

let editingRowId = null;

function shortDay(day) {
  const d = String(day || "").toUpperCase();
  if (!d) return "—";
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
  if (!s || !e) return "—";
  return `${s} - ${e}`;
}

function getRoomLabel(roomId) {
  if (!roomId) return "—";
  const r = rooms.find(x => x.id === roomId);
  return r ? (r.roomCode || r.name || r.id) : "—";
}

function getTeacherLabel(teacherId) {
  if (!teacherId) return "—";
  const t = teachers.find(x => x.id === teacherId);
  return t ? (t.name || t.fullName || t.id) : "—";
}

function injectAddRowCss() {
  const css = `
    tr.subject-head { position: relative; }
    tr.subject-head .add-row-handle {
      position:absolute; left:50%; bottom:-1px; transform:translate(-50%,50%);
      width:24px; height:24px; border-radius:999px;
      background:#1e3a8a; color:#fff; display:none;
      align-items:center; justify-content:center;
      font-weight:800; cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.25);
      z-index:5;
    }
    tr.subject-head:hover .add-row-handle{ display:inline-flex; }
  `;
  const style = document.createElement("style");
  style.textContent = css;
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
    .filter(c => c.courseCode === courseCode && c.dept === "TERTIARY_NAMEI" && c.active !== false)
    .forEach(c => {
      curriculumSelect.innerHTML += `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`;
    });
}

function openWizard() {
  wizardForm.reset();
  populateProgramOptions();
  wizardModal.classList.remove("hidden");
}

wizardCancelBtn?.addEventListener("click", () => wizardModal.classList.add("hidden"));
programSelect?.addEventListener("change", () => populateCurriculumOptions(programSelect.value));
addBtn?.addEventListener("click", openWizard);

wizardForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const courseCode = (programSelect.value || "").trim();
  const curriculumId = (curriculumSelect.value || "").trim();
  const year = parseInt(yearSelect.value, 10);
  const term = parseInt(termSelect.value, 10);

  if (!courseCode || !curriculumId || !Number.isFinite(year) || !Number.isFinite(term)) {
    alert("Please complete Program, Curriculum, Year/Grade, and Term.");
    return;
  }

  try {
    await fetchJson(API.createBlock, {
      method: "POST",
      body: JSON.stringify({ courseCode, curriculumId, year, term })
    });
    wizardModal.classList.add("hidden");
    await loadBlocks();
  } catch (err) {
    alert(err.message || "Failed to create block");
  }
});

function renderBlocks() {
  const q = (searchInput?.value || "").trim().toLowerCase();
  const list = !q ? blocks : blocks.filter(b =>
    String(b.sectionCode || "").toLowerCase().includes(q)
  );

  blocksBody.innerHTML = "";

  if (!list.length) {
    blocksBody.innerHTML = `<tr><td colspan="6">No schedules found.</td></tr>`;
    return;
  }

  list.forEach(b => {
    const tr = document.createElement("tr");
    tr.dataset.section = b.sectionCode;
    tr.innerHTML = `
      <td>${escapeHtml(b.sectionCode)}</td>
      <td>${escapeHtml(b.courseCode)}</td>
      <td>${escapeHtml(b.year)}</td>
      <td>${escapeHtml(b.term)}</td>
      <td>${b.active ? "Active" : "Inactive"}</td>
      <td>
        <button class="btn btn-secondary" data-action="view" data-section="${escapeHtml(b.sectionCode)}">View</button>
        <button class="btn btn-danger" data-action="delete" data-section="${escapeHtml(b.sectionCode)}">Delete</button>
      </td>
    `;
    blocksBody.appendChild(tr);
  });
}

function renderScheduleBlockTable(block) {
  const rows = block.rows || [];
  const sectionRowspan = rows.length || 1;

  const keyOf = (r) => String(r.subjectCode || "") + "||" + String(r.subjectName || "");
  const countByKey = new Map();
  const firstIdxByKey = new Map();

  rows.forEach((r, i) => {
    const k = keyOf(r);
    countByKey.set(k, (countByKey.get(k) || 0) + 1);
    if (!firstIdxByKey.has(k)) firstIdxByKey.set(k, i);
  });

  let html = `
    <table class="nested-table" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr>
          <th>SECTION</th>
          <th>COURSE CODE</th>
          <th>COURSE DESCRIPTION</th>
          <th>DAY</th>
          <th>TIME</th>
          <th>ROOM</th>
          <th>INSTRUCTOR</th>
          <th>ACTIONS</th>
        </tr>
      </thead>
      <tbody>
  `;

  rows.forEach((r, idx) => {
    const k = keyOf(r);
    const isHead = firstIdxByKey.get(k) === idx;
    const subjectSpan = countByKey.get(k) || 1;

    html += `<tr class="sched-row ${isHead ? "subject-head" : ""}" data-id="${escapeHtml(r.id)}">`;

    if (idx === 0) {
      html += `<td rowspan="${sectionRowspan}">${escapeHtml(block.sectionCode)}</td>`;
    }

    if (isHead) {
      html += `<td rowspan="${subjectSpan}">${escapeHtml(r.subjectCode)}</td>`;
      html += `<td rowspan="${subjectSpan}">${escapeHtml(r.subjectName)}</td>`;
    }

    html += `
      <td style="text-align:center;">${escapeHtml(shortDay(r.dayOfWeek))}</td>
      <td style="text-align:center;">${escapeHtml(timeRange(r.timeStart, r.timeEnd))}</td>
      <td style="text-align:center;">${escapeHtml(getRoomLabel(r.roomId))}</td>
      <td style="text-align:center;">${escapeHtml(getTeacherLabel(r.teacherId))}</td>
      <td style="text-align:center;">
        <button class="btn btn-secondary" data-action="edit-row">EDIT</button>
        ${isHead ? `<span class="add-row-handle" data-action="add-row" title="Add row">+</span>` : ""}
        ${r.isDuplicateRow ? `<button class="btn btn-danger" data-action="delete-row">Delete</button>` : ""}
      </td>
    `;

    html += `</tr>`;
  });

  html += `</tbody></table>`;
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
        alert(err.message || "Failed to add row");
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
        alert(err.message || "Failed to delete row");
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
  timeEndSelect.value = row.timeEnd || "";
  roomSelect.value = row.roomId || "";
  instructorSelect.value = row.teacherId || "";

  editModal.classList.remove("hidden");
}

editCancelBtn?.addEventListener("click", () => {
  editModal.classList.add("hidden");
  editingRowId = null;
});

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
    alert(err.message || "Failed to update row");
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
      alert(err.message || "Failed to delete block");
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
  roomSelect.innerHTML = `<option value="">—</option>`;
  rooms.forEach(r => {
    const label = r.roomCode || r.name || r.id;
    roomSelect.innerHTML += `<option value="${escapeHtml(r.id)}">${escapeHtml(label)}</option>`;
  });
}

function fillTeachers() {
  instructorSelect.innerHTML = `<option value="">—</option>`;
  teachers.forEach(t => {
    const label = t.name || t.fullName || t.id;
    instructorSelect.innerHTML += `<option value="${escapeHtml(t.id)}">${escapeHtml(label)}</option>`;
  });
}

function fillTimes() {
  // 7:00 to 19:00 in 30 min
  const times = [];
  for (let h=7; h<=19; h++) {
    for (let m=0; m<60; m+=30) {
      const hh = String(h).padStart(2,"0");
      const mm = String(m).padStart(2,"0");
      times.push(`${hh}:${mm}`);
    }
  }
  timeStartSelect.innerHTML = `<option value="">—</option>` + times.map(t=>`<option value="${t}">${t}</option>`).join("");
  timeEndSelect.innerHTML = `<option value="">—</option>` + times.map(t=>`<option value="${t}">${t}</option>`).join("");
}

async function loadLookups() {
  try { courses = (await fetchJson(API.courses)) || []; } catch { courses = []; }
  try { curriculums = (await fetchJson(API.curriculums)) || []; } catch { curriculums = []; }
  try { rooms = (await fetchJson(API.rooms)) || []; } catch { rooms = []; }
  try { teachers = (await fetchJson(API.teachers)) || []; } catch { teachers = []; }

  fillRooms();
  fillTeachers();
}

async function loadBlocks() {
  blocks = (await fetchJson(API.blocks)) || [];
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
searchInput?.addEventListener("input", renderBlocks);

(function init() {
  injectAddRowCss();
  fillTimes();
  loadLookups().finally(loadBlocks);
})();
