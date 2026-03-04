const API = {
  blocks: "/api/scheduler/jhs/blocks",
  createBlock: "/api/scheduler/jhs/blocks",
  deleteBlock: (section) => `/api/scheduler/jhs/blocks/${encodeURIComponent(section)}`,
  dupRow: "/api/scheduler/jhs/rows",
  delRow: (id) => `/api/scheduler/jhs/rows/${id}`,
  updRow: (id) => `/api/scheduler/jhs/rows/${id}`,

  // expected to exist in the project (same as other pages)
  settingsCurriculums: "/api/settings/curriculums",
};

const blocksBody = document.querySelector("#blocksTable tbody");
const refreshBtn = document.getElementById("refreshBtn");
const addBtn = document.getElementById("addBtn");
const searchInput = document.getElementById("searchInput");

// modal
const createModal = document.getElementById("createModal");
const createForm = document.getElementById("createForm");
const cancelCreate = document.getElementById("cancelCreate");
const programSelect = document.getElementById("programSelect");
const curriculumSelect = document.getElementById("curriculumSelect");
const gradeSelect = document.getElementById("gradeSelect");
const sectionNameInput = document.getElementById("sectionNameInput");

let blocks = [];
let openSection = null;
let curriculums = [];

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const txt = await res.text();
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { if (txt) msg = (JSON.parse(txt)?.message || msg); } catch { if (txt) msg = txt; }
    throw new Error(msg);
  }
  if (res.status === 204 || !txt) return null;
  if (ct.includes("application/json")) return JSON.parse(txt);
  return txt;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openCreateModal() {
  createModal?.classList.add("is-open");
  createModal?.setAttribute("aria-hidden", "false");
}

function closeCreateModal() {
  createModal?.classList.remove("is-open");
  createModal?.setAttribute("aria-hidden", "true");
  createForm?.reset();
  curriculumSelect.innerHTML = `<option value="">Select curriculum...</option>`;
}

function filterJhsCurriculums(list) {
  return (list || []).filter(c => String(c.dept || "").toUpperCase().includes("JHS"));
}

function populatePrograms() {
  const byProgram = new Map();
  curriculums.forEach(c => {
    const p = String(c.courseCode || "").trim();
    if (!p) return;
    if (!byProgram.has(p)) byProgram.set(p, []);
    byProgram.get(p).push(c);
  });

  const programs = [...byProgram.keys()].sort();
  programSelect.innerHTML = `<option value="">Select program...</option>` +
    programs.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
}

function populateCurriculums(programCode) {
  const list = curriculums
    .filter(c => String(c.courseCode || "") === String(programCode || ""))
    .sort((a,b) => String(a.name||"").localeCompare(String(b.name||"")));

  curriculumSelect.innerHTML = `<option value="">Select curriculum...</option>` +
    list.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
}

function renderBlocks() {
  const q = (searchInput?.value || "").trim().toLowerCase();
  const list = !q ? blocks : blocks.filter(b =>
    String(b.section || "").toLowerCase().includes(q)
  );

  blocksBody.innerHTML = "";

  if (!list.length) {
    blocksBody.innerHTML = `<tr><td colspan="4">No blocks found.</td></tr>`;
    return;
  }

  for (const b of list) {
    const tr = document.createElement("tr");
    tr.dataset.section = b.section;
    tr.innerHTML = `
      <td>${escapeHtml(b.section)}</td>
      <td>${escapeHtml(b.grade)}</td>
      <td>${escapeHtml(b.status || "Active")}</td>
      <td>
        <button class="btn btn-secondary" data-action="view" data-section="${escapeHtml(b.section)}">View</button>
        <button class="btn btn-delete" data-action="delete" data-section="${escapeHtml(b.section)}">Delete</button>
      </td>
    `;
    blocksBody.appendChild(tr);
  }
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
  <table class="nested-table" style="width:100%">
    <tr>
      <th>SECTION</th>
      <th>COURSE CODE</th>
      <th>COURSE DESCRIPTION</th>
      <th>DAY</th>
      <th>TIME</th>
      <th>ROOM</th>
      <th>INSTRUCTOR</th>
      <th>ACTIONS</th>
    </tr>`;

  rows.forEach((r, idx) => {
    const k = keyOf(r);
    const isHead = firstIdxByKey.get(k) === idx;
    const subjectSpan = countByKey.get(k) || 1;

    html += `<tr class="${isHead ? "subject-head" : ""}" data-id="${escapeHtml(r.id)}">`;

    if (idx === 0) {
      html += `<td rowspan="${sectionRowspan}">${escapeHtml(block.section)}</td>`;
    }
    if (isHead) {
      html += `<td rowspan="${subjectSpan}">${escapeHtml(r.subjectCode)}</td>`;
      html += `<td rowspan="${subjectSpan}">${escapeHtml(r.subjectName)}</td>`;
    }

    html += `
      <td style="text-align:center;">${escapeHtml(r.dayOfWeek || "—")}</td>
      <td style="text-align:center;">${escapeHtml((r.timeStart && r.timeEnd) ? (r.timeStart + " - " + r.timeEnd) : "—")}</td>
      <td style="text-align:center;">${escapeHtml(r.roomId || "—")}</td>
      <td style="text-align:center;">${escapeHtml(r.teacherId || "—")}</td>
      <td style="text-align:center;">
        <button class="btn btn-secondary" data-action="edit-row">EDIT</button>
        ${isHead ? `<span class="add-row-handle" data-action="add-row" title="Add row">+</span>` : ""}
        ${r.isDuplicateRow ? `<button class="btn btn-delete" data-action="delete-row">Delete</button>` : ""}
      </td>`;

    html += `</tr>`;
  });

  html += `</table>`;
  return html;
}

function bindScheduleBlockHandlers(detailRow) {
  detailRow.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;

    const action = el.dataset.action;

    if (action === "add-row" || action === "delete-row" || action === "edit-row") {
      const rowEl = e.target.closest("tr[data-id]");
      const rowId = rowEl?.dataset?.id;
      if (!rowId) return;

      if (action === "add-row") {
        await fetchJson(API.dupRow, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ baseRowId: rowId })
        });
        await loadBlocks();
        return;
      }

      if (action === "delete-row") {
        if (!confirm("Delete this added row?")) return;
        await fetchJson(API.delRow(rowId), { method: "DELETE" });
        await loadBlocks();
        return;
      }

      if (action === "edit-row") {
        alert("TODO: wire to your edit modal like StiTertiary.js");
      }
    }
  });
}

blocksBody.addEventListener("click", async (e) => {
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
  td.colSpan = 4;
  td.innerHTML = renderScheduleBlockTable(block);
  detail.appendChild(td);

  tr.after(detail);
  openSection = section;
  bindScheduleBlockHandlers(detail);
});

async function loadCurriculums() {
  try {
    const list = await fetchJson(API.settingsCurriculums);
    curriculums = filterJhsCurriculums(list || []);
    populatePrograms();
  } catch (e) {
    console.warn("loadCurriculums failed:", e);
    curriculums = [];
    populatePrograms();
  }
}

async function loadBlocks() {
  blocks = (await fetchJson(API.blocks)) || [];
  renderBlocks();

  if (openSection) {
    const row = [...blocksBody.querySelectorAll("tr")].find(r => r.dataset.section === openSection);
    const blk = blocks.find(b => b.section === openSection);
    if (row && blk) {
      const detail = document.createElement("tr");
      detail.className = "detail-row";
      const td = document.createElement("td");
      td.colSpan = 4;
      td.innerHTML = renderScheduleBlockTable(blk);
      detail.appendChild(td);
      row.after(detail);
      bindScheduleBlockHandlers(detail);
    }
  }
}

refreshBtn?.addEventListener("click", loadBlocks);
searchInput?.addEventListener("input", renderBlocks);
addBtn?.addEventListener("click", () => {
  openCreateModal();
});

cancelCreate?.addEventListener("click", closeCreateModal);
createModal?.addEventListener("click", (e) => {
  if (e.target === createModal) closeCreateModal();
});

programSelect?.addEventListener("change", () => populateCurriculums(programSelect.value));

createForm?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const curriculumId = (curriculumSelect.value || "").trim();
  const grade = parseInt(gradeSelect.value, 10);
  const sectionName = (sectionNameInput.value || "").trim();

  if (!curriculumId || !Number.isFinite(grade) || !sectionName) {
    alert("Please complete Program, Curriculum, Grade, and Section Name.");
    return;
  }

  await fetchJson(API.createBlock, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ curriculumId, grade, sectionName })
  });

  closeCreateModal();
  await loadBlocks();
});

(async function init() {
  await Promise.all([loadCurriculums(), loadBlocks()]);
})().catch(err => {
  console.error(err);
  blocksBody.innerHTML = `<tr><td colspan="4">Failed to load blocks: ${escapeHtml(err.message)}</td></tr>`;
});
