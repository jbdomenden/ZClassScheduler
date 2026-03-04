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
};

let blocks = [];
let openSectionCode = null; // keep expanded section open across refresh/edit
let rooms = [];
let teachers = [];
let curriculums = [];
let searchInput = null;

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

/* ===========================
   Helpers
=========================== */

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
    const res = await fetch(url, options);

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
    if (!v) return "—";
    if (v.startsWith("MON")) return "MON";
    if (v.startsWith("TUE")) return "TUE";
    if (v.startsWith("WED")) return "WED";
    if (v.startsWith("THU")) return "THU";
    if (v.startsWith("FRI")) return "FRI";
    if (v.startsWith("SAT")) return "SAT";
    return v;
}

function formatTime12h(hhmm) {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return "—";
    const [hStr, m] = hhmm.split(":");
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
}

function timeRange(start, end) {
    if (!start || !end) return "—";
    return `${formatTime12h(start)} – ${formatTime12h(end)}`;
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
        return row.roomCode || row.room || row.roomName || "—";
    }
    return "—";
}

function getTeacherLabel(teacherId, row) {
    if (teacherId) {
        const t = teachers.find(x => String(x.id) === String(teacherId));
        if (t) {
            const dept = (t.department || "").trim();
            const last = (t.lastName || "").trim();
            const first = (t.firstName || "").trim();
            return `${dept} ${last}`.trim() || `${first} ${last}`.trim() || t.email || "—";
        }
    }
    // Fallback: use row-provided fields if backend includes them
    if (row) {
        return row.instructor || row.instructorName || row.teacherName || row.teacher || "—";
    }
    return "—";
}

/* ===========================
   Search component
=========================== */

async function loadSearchComponent() {
    const container = document.getElementById("searchContainer");
    if (!container) return;

    const res = await fetch("../HTML/GlobalSearch.html");
    container.innerHTML = await res.text();

    searchInput = document.querySelector("#searchInput");
    if (searchInput) searchInput.addEventListener("input", renderBlocks);
}

/* ===========================
   Load Rooms & Teachers
=========================== */

async function loadRoomsTeachers() {
    const [r, t] = await Promise.all([fetchJson(API.rooms), fetchJson(API.teachers)]);

    rooms = (r || []).map(x => ({ id: x.id, code: x.code || x.name || "" }));
    teachers = (t || []).map(x => ({
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
   Curriculums → wizard dropdowns
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

    blocksBody.innerHTML = "";

    if (!data.length) {
        blocksBody.innerHTML = `<tr><td colspan="6">No schedules found.</td></tr>`;
        return;
    }

    data.forEach(b => {
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
          <button class="btn btn-secondary" data-action="view" data-section="${escapeHtml(b.sectionCode)}">View</button>
          <button class="btn btn-delete" data-action="delete" data-section="${escapeHtml(b.sectionCode)}">Delete</button>
        </div>
      </td>
    `;
        blocksBody.appendChild(tr);
    });
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
            alert(err.message || "Delete failed.");
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
        <button class="btn btn-secondary" data-action="edit-row">EDIT</button>
        ${isHead ? `<span class="add-row-handle" data-action="add-row" title="Add schedule row">+</span>` : ``}
        ${r.isDuplicateRow ? `<button class="btn btn-delete dup-delete-btn" data-action="delete-row" title="Delete added row">Delete</button>` : ``}
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
                alert(err.message || "Failed to add row.");
            }
            return;
        }

        if (action === "delete-row") {
            const r = (block.rows || []).find(x => String(x.id) === String(id));
            if (!r?.isDuplicateRow) {
                alert("Cannot delete base row.");
                return;
            }
            if (!confirm("Delete this added schedule row?")) return;

            try {
                await fetchJson(API.deleteRow(id), { method: "DELETE" });
                await loadBlocks();
            } catch (err) {
                console.error(err);
                alert(err.message || "Failed to delete row.");
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
    editStart.value = r.timeStart || "";
    editEnd.value = r.timeEnd || "";
    editRoom.value = r.roomId || "";
    editTeacher.value = r.teacherId || "";
    editRowModal.classList.remove("hidden");
}

editCancelBtn.addEventListener("click", () => editRowModal.classList.add("hidden"));

editRowForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = editScheduleId.value;

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
        alert(err.message || "Update failed.");
    }
});

/* ===========================
   Wizard: Create block
=========================== */

function openWizard() {
    wizardForm.reset();
    populateProgramOptions();
    programSelect.value = "";
    curriculumSelect.value = "";
    yearSelect.value = "";
    termSelect.value = "";
    wizardModal.classList.remove("hidden");
}

wizardCancelBtn.addEventListener("click", () => wizardModal.classList.add("hidden"));

programSelect.addEventListener("change", () => populateCurriculumOptions(programSelect.value));

wizardForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const courseCode = (programSelect.value || "").trim();
    const curriculumId = (curriculumSelect.value || "").trim();
    const year = parseInt(yearSelect.value, 10);
    const term = parseInt(termSelect.value, 10);

    if (!courseCode || !curriculumId || !Number.isFinite(year) || !Number.isFinite(term)) {
        alert("Please complete Program, Curriculum, Year, and Term.");
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
        alert(err.message || "Failed to create block.");
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
        alert(err.message || "Failed to load curriculum data.");
    }
});

/* ===========================
   Init
=========================== */

(async function init() {
    ensureAddRowStyles();
    await loadSearchComponent();
    await Promise.all([loadRoomsTeachers(), loadCurriculums()]);
    await loadBlocks();
})();