/* =========================================================
   MANAGE CURRICULUM (DB-backed + PDF parser + Dept + Hard Delete)
   + AUTO DETECT CURRICULUM CODE FROM PDF

   - Upload uses MODAL form (no prompt)
   - Dept column added
   - Delete Curriculum button toggles DELETE MODE
       -> shows X per row
       -> confirm -> HARD DELETE
   - Auto-detect:
       programPreview from PDF
       curriculumCode from PDF (best-effort regex/heuristics)

   ✅ NEW: Parse progress overlay + progress bar while parsing PDF
========================================================= */

const API_BASE = "/api/settings/curriculums";

let curriculumDB = []; // populated from backend
let deleteMode = false;

const token = localStorage.getItem("token");
function authHeaders() {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

let sortKey = "dept";
let sortDir = "asc";

const tableBody = document.querySelector("#curriculumListTable tbody");
const uploadBtn = document.getElementById("uploadBtn");
const manualCreateBtn = document.getElementById("manualCreateBtn");
const deleteModeBtn = document.getElementById("deleteModeBtn");

// Search
let searchInput = null;

// Upload modal
const uploadModal = document.getElementById("uploadModal");
const closeUploadModalBtn = document.getElementById("closeUploadModal");
const uploadForm = document.getElementById("uploadForm");
const pdfInput = document.getElementById("pdfInput");
const curriculumCodeInput = document.getElementById("curriculumCode");
const deptSelect = document.getElementById("deptSelect");
const programPreview = document.getElementById("programPreview");

// Manual create modal
const manualCreateModal = document.getElementById("manualCreateModal");
const manualCloseBtn = document.getElementById("manualCloseBtn");
const manualCreateForm = document.getElementById("manualCreateForm");
const manualDeptSelect = document.getElementById("manualDeptSelect");
const manualCourseCode = document.getElementById("manualCourseCode");
const manualCurriculumCode = document.getElementById("manualCurriculumCode");
const manualTemplateBtn = document.getElementById("manualTemplateBtn");
const manualAddRowBtn = document.getElementById("manualAddRowBtn");
const manualSubjectsTbody = document.querySelector("#manualSubjectsTable tbody");

let manualSubjects = [];

/* ============================
   PARSE/UPLOAD PROGRESS OVERLAY
============================ */
const parseOverlay = document.getElementById("parseProgressOverlay");
const parseFill = document.getElementById("parseProgressFill");
const parsePercent = document.getElementById("parseProgressPercent");
const parseSub = document.getElementById("parseProgressSub");
const parseTitle = document.getElementById("parseProgressTitle");
const parseOkBtn = document.getElementById("parseProgressOkBtn");

let overlayOkHandler = null;

function overlayShow() {
    if (!parseOverlay) return;
    parseOverlay.classList.add("is-visible");
}

function overlayHide() {
    if (!parseOverlay) return;
    parseOverlay.classList.remove("is-visible");
    overlaySetOkVisible(false);
    overlayOkHandler = null;
}

function overlaySetOkVisible(visible, label = "OK") {
    if (!parseOkBtn) return;
    parseOkBtn.style.display = visible ? "inline-flex" : "none";
    parseOkBtn.textContent = label;
}

if (parseOkBtn) {
    parseOkBtn.addEventListener("click", () => {
        if (typeof overlayOkHandler === "function") overlayOkHandler();
        overlayHide();
    });
}

function overlaySetState({ title, sub, percent }) {
    overlayShow();

    if (parseTitle && title) parseTitle.textContent = title;
    if (parseSub && sub) parseSub.textContent = sub;

    if (parseFill && parsePercent && typeof percent === "number") {
        const p = Math.max(0, Math.min(100, Math.round(percent)));
        parseFill.style.width = p + "%";
        parsePercent.textContent = p + "%";
    }
}

function overlaySuccess(message, onOk) {
    overlaySetState({
        title: "Success",
        sub: message || "Completed.",
        percent: 100
    });
    overlayOkHandler = onOk || null;
    overlaySetOkVisible(true, "OK");
}

function overlayError(message, onOk) {
    overlaySetState({
        title: "Error",
        sub: message || "Something went wrong.",
        percent: 100
    });
    overlayOkHandler = onOk || null;
    overlaySetOkVisible(true, "OK");
}

/* ============================
   API
============================ */

async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}

async function fetchJson(url, options) {
    const res = await fetch(url, {
        ...(options || {}),
        headers: {
            ...authHeaders(),
            ...((options || {}).headers || {}),
        },
    });
    if (!res.ok) {
        const body = await safeJson(res);
        const msg = body?.message || `${res.status} ${res.statusText}`;
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return res.status === 204 ? null : res.json();
}

async function apiGetCurriculums() {
    return fetchJson(API_BASE);
}

async function apiGetCourses() {
    return fetchJson("/api/settings/courses");
}

async function apiSetCurriculumStatus(id, active) {
    await fetchJson(`${API_BASE}/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
    });
}

async function apiGetCurriculumSubjects(id) {
    return fetchJson(`${API_BASE}/${id}/subjects`);
}

async function apiUploadCurriculum(payload) {
    return fetchJson(`${API_BASE}/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
}

async function apiHardDeleteCurriculum(id) {
    await fetchJson(`${API_BASE}/${id}`, { method: "DELETE" });
}

/* ============================
   MANUAL CREATE HELPERS
============================ */

function yearTermChoicesForDept(deptRaw) {
    const d = String(deptRaw || "").trim().toUpperCase();
    const max = (d === "JHS" || d === "SHS") ? 4 : 8;
    return Array.from({ length: max }, (_, i) => String(i + 1));
}

function ensureManualRow(idx) {
    if (!manualSubjects[idx]) manualSubjects[idx] = { yearTerm: "1", code: "", name: "" };
    const r = manualSubjects[idx];
    r.yearTerm = String(r.yearTerm || "1").trim() || "1";
    r.code = String(r.code || "").trim();
    r.name = String(r.name || "").trim();
    return r;
}

function renderManualSubjects() {
    if (!manualSubjectsTbody) return;

    const dept = String(manualDeptSelect?.value || "").trim();
    const choices = yearTermChoicesForDept(dept);

    if (!manualSubjects.length) {
        manualSubjectsTbody.innerHTML = `<tr><td colspan="4" class="muted">No subjects yet. Click "Create Template" or "Add Subject Row".</td></tr>`;
        return;
    }

    manualSubjectsTbody.innerHTML = manualSubjects.map((row, idx) => {
        const r = ensureManualRow(idx);
        const opts = choices.map((c) => `<option value="${escapeHtml(c)}" ${String(r.yearTerm) === String(c) ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");

        return `
<tr data-idx="${idx}">
  <td>
    <select data-field="yearTerm" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;width:100%;">
      ${opts}
    </select>
  </td>
  <td>
    <input data-field="code" value="${escapeHtml(r.code)}" placeholder="e.g. CITE1004" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;width:100%;" />
  </td>
  <td>
    <input data-field="name" value="${escapeHtml(r.name)}" placeholder="e.g. Introduction to Computing" style="padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;width:100%;" />
  </td>
  <td style="text-align:center;">
    <button type="button" class="btn btn-delete btn-icon" data-remove="${idx}" aria-label="Remove row">x</button>
  </td>
</tr>`;
    }).join("");

    if (!manualSubjectsTbody.dataset.bound) {
        manualSubjectsTbody.dataset.bound = "1";

        manualSubjectsTbody.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-remove]");
            if (!btn) return;
            const idx = parseInt(btn.getAttribute("data-remove"), 10);
            if (!Number.isFinite(idx)) return;
            manualSubjects.splice(idx, 1);
            renderManualSubjects();
        });

        manualSubjectsTbody.addEventListener("input", (e) => {
            const tr = e.target.closest("tr[data-idx]");
            if (!tr) return;
            const idx = parseInt(tr.getAttribute("data-idx"), 10);
            if (!Number.isFinite(idx)) return;
            const field = e.target.getAttribute("data-field");
            if (!field) return;
            const r = ensureManualRow(idx);
            r[field] = String(e.target.value || "");
        });

        manualSubjectsTbody.addEventListener("change", (e) => {
            const tr = e.target.closest("tr[data-idx]");
            if (!tr) return;
            const idx = parseInt(tr.getAttribute("data-idx"), 10);
            if (!Number.isFinite(idx)) return;
            const field = e.target.getAttribute("data-field");
            if (!field) return;
            const r = ensureManualRow(idx);
            r[field] = String(e.target.value || "");
        });
    }
}

/* ============================
   SEARCH COMPONENT
============================ */

async function loadSearchComponent() {
    const container = document.getElementById("searchContainer");
    if (!container) return;

    const res = await fetch("/ZClassScheduler/html/GlobalSearch.html");
    container.innerHTML = await res.text();

    searchInput = document.querySelector("#searchInput");
    if (searchInput) searchInput.addEventListener("input", renderCurriculumList);

    const clearBtn = container.querySelector(".clear-btn");
    if (clearBtn && searchInput) {
        const sync = () => (clearBtn.style.display = searchInput.value ? "block" : "none");
        searchInput.addEventListener("input", sync);
        clearBtn.addEventListener("click", () => {
            searchInput.value = "";
            sync();
            renderCurriculumList();
        });
        sync();
    }
}

/* ============================
   RENDER LIST
============================ */

function normalizeCurriculums(apiList) {
    return (apiList || []).map(c => ({
        id: c.id,
        curriculumCode: c.name,   // backend stores code in name field
        program: c.courseCode,    // backend stores program in courseCode field
        dept: c.dept || "TERTIARY_STI",
        isActive: !!c.active
    }));
}

function deptLabel(v) {
    const x = String(v || "").toUpperCase();
    if (x === "TERTIARY_STI") return "Tertiary STI";
    if (x === "TERTIARY_NAMEI") return "Tertiary NAMEI";
    if (x === "JHS") return "Junior High School";
    if (x === "SHS") return "Senior High School";
    return x || "—";
}

function normalizeSortVal(v) {
    if (v == null) return "";
    if (typeof v === "number") return v;
    const s = String(v).trim();
    const n = Number(s);
    if (!Number.isNaN(n) && s !== "") return n;
    return s.toLowerCase();
}

function compareCurriculums(a, b) {
    const dir = sortDir === "desc" ? -1 : 1;
    const av = normalizeSortVal(a?.[sortKey]);
    const bv = normalizeSortVal(b?.[sortKey]);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;

    // Default tie-breakers: dept -> program -> curriculumCode
    const d = normalizeSortVal(a?.dept).localeCompare(normalizeSortVal(b?.dept));
    if (d !== 0) return d;
    const p = normalizeSortVal(a?.program).localeCompare(normalizeSortVal(b?.program));
    if (p !== 0) return p;
    return normalizeSortVal(a?.curriculumCode).localeCompare(normalizeSortVal(b?.curriculumCode));
}

function updateSortUI() {
    const table = document.getElementById("curriculumListTable");
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
    const table = document.getElementById("curriculumListTable");
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
        renderCurriculumList();
    });

    // Default: department then program
    sortKey = "dept";
    sortDir = "asc";
    updateSortUI();
}

function renderCurriculumList() {
    const q = (searchInput?.value || "").trim().toLowerCase();
    const list = (!q ? curriculumDB : curriculumDB.filter(c =>
        String(c.curriculumCode || "").toLowerCase().includes(q) ||
        String(c.program || "").toLowerCase().includes(q) ||
        String(c.dept || "").toLowerCase().includes(q)
    )).slice().sort(compareCurriculums);

    tableBody.innerHTML = "";

    if (!list.length) {
        tableBody.innerHTML = `<tr><td colspan="5">No curriculums found.</td></tr>`;
        return;
    }

    list.forEach(curr => {
        const row = document.createElement("tr");
        row.dataset.id = curr.id;

        row.innerHTML = `
      <td>${escapeHtml(curr.curriculumCode)}</td>
      <td>${escapeHtml(curr.program)}</td>
      <td>${escapeHtml(deptLabel(curr.dept))}</td>
      <td>
        <span class="${curr.isActive ? 'status-active' : 'status-inactive'}">
          ${curr.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td>
        ${deleteMode
            ? `<button class="row-x-btn" data-action="delete" data-id="${curr.id}" title="Delete">X</button>`
            : `
              <button class="btn btn-secondary" data-action="view" data-id="${curr.id}">View</button>
              <button class="btn ${curr.isActive ? 'btn-warning' : 'btn-success'}"
                      data-action="toggle"
                      data-id="${curr.id}">
                ${curr.isActive ? 'Deactivate' : 'Activate'}
              </button>
            `
        }
      </td>
    `;

        tableBody.appendChild(row);
    });
}

/* ============================
   TABLE ACTIONS
============================ */

tableBody.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const id = e.target.dataset.id;
    const clickedRow = e.target.closest("tr");

    try {
        if (action === "view") await openCurriculum(id, clickedRow);
        if (action === "toggle") await toggleCurriculum(id);

        if (action === "delete") {
            const curr = curriculumDB.find(c => String(c.id) === String(id));
            const label = curr ? `${curr.curriculumCode} (${curr.program})` : "this curriculum";

            if (!confirm(`Hard delete ${label}?\n\nThis will permanently remove the curriculum and its subjects.`)) return;

            await apiHardDeleteCurriculum(id);
            await loadCurriculums();
        }
    } catch (err) {
        console.error(err);
        appAlert(err.message || "Something went wrong.");
    }
});

/* ============================
   VIEW DETAILS
============================ */

async function openCurriculum(id, clickedRow) {
    const existingDetail = document.querySelector(".curriculum-detail");
    if (existingDetail) {
        if (existingDetail.dataset.parentId == id) {
            existingDetail.remove();
            return;
        }
        existingDetail.remove();
    }

    const ELECTIVE_YT = 9;
    const ELECTIVE_MARKER_RE = /\s*\[\[EL:([^\]]+)\]\]\s*$/;

    function splitElectiveMarker(name) {
        const raw = String(name || "");
        const m = raw.match(ELECTIVE_MARKER_RE);
        if (!m) return { cleanName: raw, electiveSub: "" };
        return {
            cleanName: raw.replace(ELECTIVE_MARKER_RE, "").trim(),
            electiveSub: String(m[1] || "").trim()
        };
    }

    const curr = curriculumDB.find(c => String(c.id) === String(id));
    const dept = String(curr?.dept || "").toUpperCase();

    const subjects = await apiGetCurriculumSubjects(id);

    const courses = (subjects || []).map(s => {
        const yt = parseInt(s.yearTerm, 10);
        const { cleanName, electiveSub } = splitElectiveMarker(s.name || "");

        let groupKey = "";

        if (Number.isFinite(yt)) {
            // Electives only apply to tertiary templates
            if (yt === ELECTIVE_YT && (dept === "TERTIARY_STI" || dept === "TERTIARY_NAMEI")) {
                groupKey = `Elective Course List (${electiveSub || "Electives"})`;
            } else if (dept === "JHS") {
                // JHS: yearTerm 1..4 => Grade 7..10
                const grade = yt + 6; // 1->7, 2->8, 3->9, 4->10
                groupKey = `Grade ${grade}`;
            } else if (dept === "SHS") {
                // SHS: yearTerm 1..4 => G11 Term 1..G12 Term 2
                const map = {
                    1: "G11 Term 1",
                    2: "G11 Term 2",
                    3: "G12 Term 1",
                    4: "G12 Term 2"
                };
                groupKey = map[yt] || "SHS";
            } else {
                // Tertiary (default): yearTerm => Year/Term
                const year = Math.ceil(yt / 2);
                const term = (yt % 2 === 0) ? 2 : 1;
                groupKey = `Year ${year} - Term ${term}`;
            }
        } else {
            groupKey = "Ungrouped";
        }

        const m = String(s.code || "").match(/^([A-Z]+)(\d+)/);
        const subjectArea = m ? m[1] : (s.code || "");
        const catalogNo = m ? m[2] : "";

        return {
            groupKey,
            subjectArea,
            catalogNo,
            description: cleanName || ""
        };
    });

    const grouped = groupByGroupKey(courses);

    const detailRow = document.createElement("tr");
    detailRow.classList.add("curriculum-detail");
    detailRow.dataset.parentId = id;

    detailRow.innerHTML = `
    <td colspan="5">
      ${renderCourseTable(grouped)}
    </td>
  `;

    clickedRow.after(detailRow);
}

function groupByGroupKey(courses) {
    const map = {};
    courses.forEach(course => {
        const key = course.groupKey || "Ungrouped";
        if (!map[key]) map[key] = [];
        map[key].push(course);
    });

    const keys = Object.keys(map);
    keys.sort((a, b) => {
        // 1) Year/Term (tertiary)
        const pa = a.match(/^Year\s+(\d+)\s*-\s*Term\s+(\d+)/i);
        const pb = b.match(/^Year\s+(\d+)\s*-\s*Term\s+(\d+)/i);
        if (pa && pb) {
            const ya = parseInt(pa[1], 10), ta = parseInt(pa[2], 10);
            const yb = parseInt(pb[1], 10), tb = parseInt(pb[2], 10);
            return (ya - yb) || (ta - tb);
        }
        if (pa && !pb) return -1;
        if (!pa && pb) return 1;

        // 2) JHS Grade ordering
        const ga = a.match(/^Grade\s+(7|8|9|10)$/i);
        const gb = b.match(/^Grade\s+(7|8|9|10)$/i);
        if (ga && gb) return parseInt(ga[1], 10) - parseInt(gb[1], 10);
        if (ga && !gb) return -1;
        if (!ga && gb) return 1;

        // 3) SHS ordering: G11 Term 1..G12 Term 2
        const sa = a.match(/^G(11|12)\s+Term\s+(1|2)$/i);
        const sb = b.match(/^G(11|12)\s+Term\s+(1|2)$/i);
        if (sa && sb) {
            const gaN = parseInt(sa[1], 10), taN = parseInt(sa[2], 10);
            const gbN = parseInt(sb[1], 10), tbN = parseInt(sb[2], 10);
            const ia = (gaN - 11) * 2 + taN; // 11T1->1, 11T2->2, 12T1->3, 12T2->4
            const ib = (gbN - 11) * 2 + tbN;
            return ia - ib;
        }
        if (sa && !sb) return -1;
        if (!sa && sb) return 1;

        // 4) Electives near the end (after core blocks)
        const ae = /^Elective Course List/i.test(a);
        const be = /^Elective Course List/i.test(b);
        if (ae && !be) return 1;
        if (!ae && be) return -1;

        return a.localeCompare(b);
    });

    const ordered = {};
    keys.forEach(k => ordered[k] = map[k]);
    return ordered;
}

function renderCourseTable(grouped) {
    let html = "";
    for (const key in grouped) {
        html += `<h4>${escapeHtml(key)}</h4>`;
        html += `
      <table class="nested-table">
        <tr>
          <th>Course Code</th>
          <th>Description</th>
        </tr>
    `;

        grouped[key].forEach(c => {
            html += `
        <tr>
          <td>${escapeHtml(`${c.subjectArea} ${c.catalogNo}`.trim())}</td>
          <td>${escapeHtml(c.description)}</td>
        </tr>
      `;
        });

        html += `</table>`;
    }
    return html;
}

/* ============================
   TOGGLE ACTIVE
============================ */

async function toggleCurriculum(id) {
    const curr = curriculumDB.find(c => String(c.id) === String(id));
    if (!curr) return;

    await apiSetCurriculumStatus(id, !curr.isActive);
    await loadCurriculums();
}

/* ============================
   UPLOAD MODAL
============================ */

uploadBtn.addEventListener("click", async () => {
    uploadForm.reset();
    resetUploadDetectedFields();
    setUploadInputsEnabled(false);
    uploadModal.classList.remove("hidden");
    // User must pick department first
    if (deptSelect) deptSelect.focus();
});

closeUploadModalBtn.addEventListener("click", () => {
    uploadModal.classList.add("hidden");
});

/* ============================
   MANUAL CREATE MODAL
============================ */

function openManualCreateModal() {
    if (!manualCreateModal) return;
    manualCreateModal.classList.remove("hidden");
}

function closeManualCreateModal() {
    if (!manualCreateModal) return;
    manualCreateModal.classList.add("hidden");
}

async function loadManualCourses() {
    if (!manualCourseCode) return;
    if (manualCourseCode.dataset.loaded === "1") return;

    const courses = await apiGetCourses().catch(() => []);
    const items = (courses || [])
        .map((c) => ({
            code: String(c?.code || "").trim().toUpperCase(),
            name: String(c?.name || "").trim(),
            active: String(c?.status || "Active").trim().toLowerCase() === "active"
        }))
        .filter((c) => c.code)
        .sort((a, b) => a.code.localeCompare(b.code));

    manualCourseCode.innerHTML = `<option value="" disabled selected>Select Program</option>` +
        items.map((c) => {
            const label = c.name ? `${c.code} - ${c.name}` : c.code;
            return `<option value="${escapeHtml(c.code)}">${escapeHtml(label)}${c.active ? "" : " (Inactive)"}</option>`;
        }).join("");

    manualCourseCode.dataset.loaded = "1";
}

function syncManualControls() {
    const dept = String(manualDeptSelect?.value || "").trim();
    const enabled = !!dept;
    if (manualTemplateBtn) manualTemplateBtn.disabled = !enabled;
    if (manualAddRowBtn) manualAddRowBtn.disabled = !enabled;
}

if (manualCreateBtn) {
    manualCreateBtn.addEventListener("click", async () => {
        if (manualCreateForm) manualCreateForm.reset();
        manualSubjects = [];
        renderManualSubjects();
        syncManualControls();

        await loadManualCourses();
        openManualCreateModal();
        if (manualDeptSelect) manualDeptSelect.focus();
    });
}

if (manualCloseBtn) {
    manualCloseBtn.addEventListener("click", () => {
        closeManualCreateModal();
    });
}

if (manualDeptSelect) {
    manualDeptSelect.addEventListener("change", () => {
        syncManualControls();
        // Re-render to update year/term choices when switching departments.
        if (manualSubjects.length) renderManualSubjects();
    });
}

if (manualTemplateBtn) {
    manualTemplateBtn.addEventListener("click", () => {
        const dept = String(manualDeptSelect?.value || "").trim();
        if (!dept) {
            appAlert("Please select a Department first.");
            return;
        }

        const yt = yearTermChoicesForDept(dept);
        manualSubjects = yt.map((v) => ({ yearTerm: v, code: "", name: "" }));
        renderManualSubjects();
    });
}

if (manualAddRowBtn) {
    manualAddRowBtn.addEventListener("click", () => {
        const dept = String(manualDeptSelect?.value || "").trim();
        if (!dept) {
            appAlert("Please select a Department first.");
            return;
        }
        manualSubjects.push({ yearTerm: "1", code: "", name: "" });
        renderManualSubjects();
    });
}

if (manualCreateForm) {
    manualCreateForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const dept = String(manualDeptSelect?.value || "").trim();
        const courseCode = String(manualCourseCode?.value || "").trim().toUpperCase();
        const code = String(manualCurriculumCode?.value || "").trim();

        if (!dept) return overlayError("Select a Department first.");
        if (!courseCode) return overlayError("Select a Program first.");
        if (!code) return overlayError("Curriculum Code is required.");

        const subjects = (manualSubjects || [])
            .map((r) => ({
                code: String(r.code || "").trim(),
                name: String(r.name || "").trim(),
                yearTerm: String(r.yearTerm || "").trim(),
            }))
            .filter((r) => r.code && r.name && r.yearTerm);

        if (!subjects.length) {
            overlayError("Add at least one subject (code, name, and year/term).");
            return;
        }

        try {
            await apiUploadCurriculum({
                courseCode,
                name: code,
                dept,
                subjects,
            });

            overlaySuccess("Curriculum created.", async () => {
                closeManualCreateModal();
                await loadCurriculums();
            });
        } catch (err) {
            console.error(err);
            overlayError(err?.message || "Create failed.");
        }
    });
}

// Department must be selected before choosing a file / auto-detection
if (deptSelect) {
    deptSelect.addEventListener("change", () => {
        const dept = String(deptSelect.value || "").trim();
        if (!dept) {
            setUploadInputsEnabled(false);
            resetUploadDetectedFields();
            if (pdfInput) pdfInput.value = "";
            return;
        }
        setUploadInputsEnabled(true);
        // changing department invalidates previous detection
        resetUploadDetectedFields();
        if (pdfInput) pdfInput.value = "";
    });
}

/**
 * When PDF changes:
 * - parse text
 * - auto-fill program preview
 * - auto-detect curriculum code and fill if input is empty
 */
pdfInput.addEventListener("change", async () => {
    try {
        const dept = String(deptSelect?.value || "").trim();
        if (!dept) {
            if (pdfInput) pdfInput.value = "";
            appAlert("Please select a Department first.");
            return;
        }

        programPreview.value = "";

        if (!pdfInput.files.length) return;

        const file = pdfInput.files[0];

        // shows overlay + progress
        const pdfText = await extractTextFromPdf(file);

        // STEP 1: Detect curriculum code
        const detectedCode = detectCurriculumCodeFromText(pdfText, "");

        if (detectedCode) {
            curriculumCodeInput.value = detectedCode;

            // STEP 2: Extract program from code (first part before "-")
            const program = detectedCode.split("-")[0].trim().toUpperCase();
            programPreview.value = program;
            return; // stop here (do not fallback)
        }

        // STEP 3: Fallback to old template detection (if no code found)
        const parsed = parseCurriculumFromText(pdfText, dept);
        if (parsed.program) {
            programPreview.value = parsed.program.toUpperCase();
        }
    } catch (e) {
        hideParseProgress();
        console.error(e);
    }
});

uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    try {
        const dept = String(deptSelect?.value || "").trim();
        if (!dept) {
            overlayError("Select a Department first.");
            return;
        }
        if (!pdfInput.files.length) {
            overlayError("Select a PDF first.");
            return;
        }

        const file = pdfInput.files[0];

        // IMPORTANT: keep overlay open for upload flow
        const pdfText = await extractTextFromPdf(file, { keepOpen: true });

        const parsed = parseCurriculumFromText(pdfText, dept);

        let curriculumCode = (curriculumCodeInput.value || "").trim();
        if (!curriculumCode) {
            overlayError("Curriculum Code not detected.");
            return;
        }

        const program = curriculumCode.split("-")[0].trim().toUpperCase();
        programPreview.value = program;

        const prog = programFromCurriculumCode(curriculumCode);
        if (!prog) {
            overlayError("Could not derive Program from Curriculum Code.");
            return;
        }
        programPreview.value = prog;

        if (!parsed.subjects || !parsed.subjects.length) {
            overlayError("Could not parse subjects from the PDF. Please try a clearer curriculum PDF.");
            return;
        }

        // Upload stage
        overlaySetState({ title: "Uploading Curriculum...", sub: "Sending data to server...", percent: 100 });

        await apiUploadCurriculum({
            courseCode: program,
            name: curriculumCode,
            dept,
            subjects: parsed.subjects
        });

        // Success: keep overlay and show OK
        overlaySuccess("Curriculum uploaded successfully.", async () => {
            uploadModal.classList.add("hidden");
            await loadCurriculums();
        });

    } catch (err) {
        console.error(err);
        overlayError(err.message || "Something went wrong.");
    }
});
/* ============================
   DELETE MODE
============================ */

deleteModeBtn.addEventListener("click", () => {
    deleteMode = !deleteMode;
    deleteModeBtn.textContent = deleteMode ? "Done" : "Delete Curriculum";

    const existingDetail = document.querySelector(".curriculum-detail");
    if (existingDetail) existingDetail.remove();

    renderCurriculumList();
});

/* ============================
   PDF PARSER
============================ */

async function extractTextFromPdf(file, options = {}) {
    if (!window.pdfjsLib) throw new Error("PDF parser not loaded.");

    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    overlaySetState({ title: "Parsing Curriculum PDF...", sub: "Loading PDF...", percent: 1 });

    const ab = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: ab }).promise;

    let fullText = "";
    const total = pdf.numPages;

    for (let i = 1; i <= total; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(it => it.str);
        fullText += strings.join("\n") + "\n";

        const percent = Math.round((i / total) * 100);
        overlaySetState({
            title: "Parsing Curriculum PDF...",
            sub: `Reading page ${i} of ${total}...`,
            percent
        });

        await new Promise(r => setTimeout(r, 10)); // allow repaint
    }

    // If NOT keeping open (like pdfInput change), hide it
    if (!options.keepOpen) {
        overlayHide();
    } else {
        // keep visible for upload stage
        overlaySetState({ title: "Preparing Upload...", sub: "Validating parsed data...", percent: 100 });
    }

    return fullText;
}
/**
 * Your existing subject/program parser
 */
function parseCurriculumFromText(text, dept) {
    const d = String(dept || "").toUpperCase().trim();

    if (d === "TERTIARY_STI") {
        if (window.StiParser?.parse) return window.StiParser.parse(text);
    }
    if (d === "TERTIARY_NAMEI") {
        if (window.NameiParser?.parse) return window.NameiParser.parse(text);
    }

    // Accept both legacy and current dept codes
    if (d === "JHS" || d === "JUNIOR_HIGH_SCHOOL") {
        if (window.JhsParser?.parse) return window.JhsParser.parse(text);
    }
    if (d === "SHS" || d === "SENIOR_HIGH_SCHOOL") {
        if (window.ShsParser?.parse) return window.ShsParser.parse(text);
    }

    const primary = parseCurriculumFromText_OldTemplate(text);
    if (primary?.subjects?.length) return primary;

    const alt = parseCurriculumStructureTemplate(text);
    if (alt?.subjects?.length) return alt;

    return { program: "", subjects: [] };
}

/* =========================================================
   ✅ KEEP YOUR EXISTING ORIGINAL LOGIC HERE
   Rename your old function body into this function
========================================================= */
function parseCurriculumFromText_OldTemplate(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map(l => l.replace(/\s+/g, " ").trim())
        .filter(Boolean);

    // Electives are stored as numeric yearTerm to satisfy backend expectations.
    // Sub-block label is embedded in subject name as: "... [[EL:Application Development]]"
    const ELECTIVE_YT = 9;
    const ELECTIVE_MARKER_RE = /\s*\[\[EL:([^\]]+)\]\]\s*$/;

    function yearWordToNum(w) {
        const x = String(w || "").toLowerCase();
        if (x === "first") return 1;
        if (x === "second") return 2;
        if (x === "third") return 3;
        if (x === "fourth") return 4;
        return null;
    }
    function termWordToNum(w) {
        const x = String(w || "").toLowerCase();
        if (x === "first") return 1;
        if (x === "second") return 2;
        return null;
    }
    function yearTermNum(year, term) {
        return String((year - 1) * 2 + term);
    }

    // Program detection (top)
    let program = "";
    for (const l of lines.slice(0, 120)) {
        const m = l.match(/^([A-Z]{2,10})\s+(FIRST|SECOND|THIRD|FOURTH)\s+YEAR,\s+(FIRST|SECOND)\s+TERM\b/i);
        if (m) { program = m[1].toUpperCase(); break; }
        const m2 = l.match(/^([A-Z]{2,10})\s*-\s*BS\b/i);
        if (m2) { program = m2[1].toUpperCase(); break; }
    }

    let currentYear = null;
    let currentTerm = null;
    let currentYearTerm = "";      // numeric 1..8
    let inElectives = false;
    let electiveSubBlock = "";

    function setYearTermFromHeader(m) {
        if (!program) program = m[1].toUpperCase();
        currentYear = yearWordToNum(m[2]);
        currentTerm = termWordToNum(m[3]);
        currentYearTerm = (currentYear && currentTerm) ? yearTermNum(currentYear, currentTerm) : "";
        inElectives = false;
        electiveSubBlock = "";
    }
    function setElectivesOn() {
        currentYear = null;
        currentTerm = null;
        currentYearTerm = "";
        inElectives = true;
        electiveSubBlock = "";
    }
    function setElectiveSubBlock(name) {
        electiveSubBlock = String(name || "").replace(/\s+/g, " ").trim();
    }

    const subjects = [];

    // Column-flow row parser (matches STI tertiary PDF extraction)
    const isCourseId = (s) => /^\d{6}$/.test(s);
    const isUnits = (s) => /^\d+\.\d{2}$/.test(s);

    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];

        // Year/Term header
        const header = l.match(/^([A-Z]{2,10})\s+(FIRST|SECOND|THIRD|FOURTH)\s+YEAR,\s+(FIRST|SECOND)\s+TERM\b/i);
        if (header) {
            setYearTermFromHeader(header);
            continue;
        }

        // Enter electives mode (parent)
        if (/^\s*[A-Z]{2,10}\s+ELECTIVE\s+COURSES\b/i.test(l)) {
            setElectivesOn();
            continue;
        }

        // Sub-block line above elective table header
        let em = l.match(/ELECTIVE\s+COURSE\s+LIST\s*\(([^)]+)\)/i);
        if (em) {
            setElectivesOn();
            setElectiveSubBlock(em[1]);
            continue;
        }
        em = l.match(/ELECTIVES\s*\(([^)]+)\)/i);
        if (em) {
            setElectivesOn();
            setElectiveSubBlock(em[1]);
            continue;
        }

        // Start row
        if (!isCourseId(l)) continue;

        const subjectArea = (lines[i + 1] || "").toUpperCase();
        const catalogNo = (lines[i + 2] || "");
        const offeringNo = (lines[i + 3] || "");

        if (!/^[A-Z]{2,10}$/.test(subjectArea)) continue;
        if (!/^\d{4}$/.test(catalogNo)) continue;
        if (!/^\d{1,3}$/.test(offeringNo)) continue;

        i += 4;

        const descParts = [];
        while (i < lines.length && !isUnits(lines[i]) && !isCourseId(lines[i])) {
            if (/YEAR,\s+(FIRST|SECOND)\s+TERM\b/i.test(lines[i])) break;
            if (/^(COURSE ID|SUBJECT AREA|CATALOG NO|OFFERING NO|DESCRIPTION|UNIT\/?S|COMPONENT|PRE REQUISITE)/i.test(lines[i])) {
                i++;
                continue;
            }
            if (/^\d+\.\d{2}$/.test(lines[i])) break;
            descParts.push(lines[i]);
            i++;
        }

        if (i < lines.length && isUnits(lines[i])) i++;
        i--;

        const desc = descParts.join(" ").replace(/\s+/g, " ").trim();
        if (!desc) continue;

        const code = `${subjectArea}${catalogNo}`.replace(/\s+/g, "").trim();

        let yearTerm = currentYearTerm || "1";
        let name = desc;
        if (inElectives) {
            yearTerm = String(ELECTIVE_YT);
            const sub = electiveSubBlock || "Electives";
            name = `${desc} [[EL:${sub}]]`;
        }

        subjects.push({ code, name, yearTerm });
        if (!program) program = subjectArea;
    }

    // Cleanup: ensure marker format consistent
    for (const s of subjects) {
        if (!s?.name) continue;
        const m = String(s.name).match(ELECTIVE_MARKER_RE);
        if (m) {
            s.name = String(s.name).replace(ELECTIVE_MARKER_RE, "").trim() + ` [[EL:${m[1]}]]`;
        }
    }

    return { program, subjects };
}

/* =========================================================
   ✅ NEW TEMPLATE: "CURRICULUM STRUCTURE" (JHS/SHS)
========================================================= */
function parseCurriculumStructureTemplate(text) {
    const lines = String(text || "")
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean);

    let program = "";

    // Detect something like "JHS-Junior High School"
    for (const l of lines.slice(0, 50)) {
        const m = l.match(/\b([A-Z]{2,10})-\s*JUNIOR HIGH SCHOOL\b/i);
        if (m) { program = m[1].toUpperCase(); break; }
    }

    let currentYearTerm = null;

    function mapGradeToYearTerm(gradeNum, isSHS) {
        const g = parseInt(gradeNum, 10);
        if (!Number.isFinite(g)) return null;
        if (isSHS) {
            if (g === 11) return 1;
            if (g === 12) return 2;
            return null;
        }
        if (g >= 7 && g <= 10) return g - 6; // 7->1,8->2,9->3,10->4
        return null;
    }

    const subjects = [];

    // Merge wrapped lines (common in JHS/SHS descriptions)
    const merged = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i];

        if (
            merged.length &&
            !/^\d{6}\b/.test(l) &&
            /^\d{6}\b/.test(merged[merged.length - 1]) &&
            !/\b\d+\.\d{2}\b/.test(merged[merged.length - 1])
        ) {
            merged[merged.length - 1] += " " + l;
            continue;
        }
        merged.push(l);
    }

    for (const l of merged) {
        // Detect grade headers
        let m = l.match(/\b(JUNIOR HIGH SCHOOL)\s+GRADE\s+(\d{1,2})\b/i);
        if (m) {
            currentYearTerm = mapGradeToYearTerm(m[2], false);
            continue;
        }
        m = l.match(/\b(SENIOR HIGH SCHOOL)\s+GRADE\s+(\d{1,2})\b/i);
        if (m) {
            currentYearTerm = mapGradeToYearTerm(m[2], true);
            continue;
        }

        // Parse subject row
        m = l.match(/^(\d{6})\s+([A-Z]{2,10})\s+(\d{4})\s+(\d{1,3})\s+(.*)$/);
        if (!m) continue;

        const subjectArea = m[2].toUpperCase();
        const catalogNo = m[3];
        const remainder = m[5];

        // remove tail "1.00 Lecture" etc
        const tail = remainder.match(/\b(\d+\.\d{2})\s+(LECTURE|LAB|LABORATORY|LEC)\b/i);

        let desc = remainder;
        if (tail && tail.index != null) {
            desc = remainder.slice(0, tail.index).trim();
        }

        desc = desc.replace(/\s+/g, " ").trim();
        const code = `${subjectArea}${catalogNo}`.replace(/\s+/g, "").trim();

        if (!currentYearTerm) currentYearTerm = 1; // fallback

        if (code && desc) {
            subjects.push({
                code,
                name: desc,
                yearTerm: String(currentYearTerm)
            });
        }
    }

    return { program, subjects };
}

/**
 * NEW: Program from curriculum code
 */
function programFromCurriculumCode(code) {
    const v = String(code || "").trim();
    if (!v) return "";
    const m = v.match(/^([A-Z0-9]+)\s*-/i);
    return (m ? m[1] : "").toUpperCase();
}

/**
 * NEW: Detect curriculum code from text.
 */
function detectCurriculumCodeFromText(text, programHint) {
    const raw = String(text || "");
    const upper = raw.toUpperCase();

    // First-page/header usually appears early in extracted text
    const head = upper.slice(0, 12000);

    const prog = String(programHint || "").toUpperCase().trim();
    const progPrefix = prog ? prog.replace(/[^A-Z0-9]/g, "") : "";

    const candidates = [];

    function normalize(prefix, year, seq) {
        const p = String(prefix || "").replace(/\./g, "").trim();
        const y = String(year || "").trim();
        const s = String(seq || "").trim();
        if (!p || !y || !s) return "";
        const yy = y.length === 4 ? y.slice(-2) : y; // normalize 2024 -> 24
        return `${p}-${yy}-${String(s).padStart(2, "0")}`;
    }

    function pushIf(prefix, year, seq) {
        const v = normalize(prefix, year, seq);
        if (v) candidates.push(v);
    }

    function scan(blob) {
        // match JHS-24-01 / SHS-24-01
        let m = blob.match(/\b(JHS|SHS)[-\s_]?(\d{2})[-\s_]?(\d{1,2})\b/);
        if (m) { pushIf(m[1], m[2], m[3]); return; }

        // explicit label line
        m = blob.match(/CURRICULUM\s*(CODE)?[^A-Z0-9]{0,30}([A-Z]{2,20}|JHS|SHS|SCHOOL|SY|S\.Y\.)[-\s_]?(\d{2,4})[-\s_]?(\d{1,2})/);
        if (m) { pushIf(m[2], m[3], m[4]); return; }

        // general pattern: BSIT-24-01 / BSIT-2024-01
        m = blob.match(/\b([A-Z]{2,12})[-\s_]?(\d{2,4})[-\s_]?(\d{1,2})\b/);
        if (m) { pushIf(m[1], m[2], m[3]); return; }
    }

    scan(head);
    if (!candidates.length) scan(upper);

    if (!candidates.length) return "";

    if (progPrefix) {
        const preferred = candidates.find(c => c.startsWith(progPrefix + "-"));
        if (preferred) return preferred;
    }

    return candidates[0];
}

/* ============================
   INIT
============================ */

async function loadCurriculums() {
    const apiList = await apiGetCurriculums();
    curriculumDB = normalizeCurriculums(apiList);
    renderCurriculumList();
}

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

(async function init() {
    if (!token) {
        window.location.href = "/ZClassScheduler/html/Login.html";
        return;
    }
    await loadSearchComponent();
    initHeaderSort();
    await loadCurriculums();
})().catch(err => {
    console.error(err);
    renderCurriculumList();
});
