/* =========================================================
   MANAGE COURSE (DB-backed)
========================================================= */



/* =========================================================
   MULTI-COLUMN SORTER (Shift+Click) + Animated Arrow (CSS-driven)
   - Click: sort by 1 column (toggles asc/desc)
   - Shift+Click: add/toggle secondary/tertiary sorts
   - JS injects <span class="sort-icon"></span> into sortable THs
========================================================= */

let __SORT_STATE__ = [];
let __SORT_INIT_DONE__ = false;
let __SORT_TABLE_ID__ = null;
let __SORT_KEY_BY_INDEX__ = null;

function __normalizeSortVal(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return v;
    const s = String(v).trim();
    const n = Number(s);
    if (!Number.isNaN(n) && s !== "") return n;
    return s.toLowerCase();
}

function __applyMultiSort(data) {
    if (!Array.isArray(data)) return [];
    if (!__SORT_STATE__.length) return [...data];
    return [...data].sort((a, b) => {
        for (const s of __SORT_STATE__) {
            const av = __normalizeSortVal(a?.[s.key]);
            const bv = __normalizeSortVal(b?.[s.key]);
            if (av < bv) return s.dir === "asc" ? -1 : 1;
            if (av > bv) return s.dir === "asc" ? 1 : -1;
        }
        return 0;
    });
}

function __ensureSortIcon(th) {
    let icon = th.querySelector(".sort-icon");
    if (!icon) {
        icon = document.createElement("span");
        icon.className = "sort-icon";
        th.appendChild(icon);
    }
    return icon;
}

function __updateSortUI() {
    const table = document.getElementById(__SORT_TABLE_ID__);
    if (!table) return;

    table.querySelectorAll("thead th[data-key]").forEach(th => {
        const key = th.getAttribute("data-key");
        const idx = __SORT_STATE__.findIndex(s => s.key === key);

        th.classList.remove("sorted", "asc", "desc");
        th.removeAttribute("data-order");
        __ensureSortIcon(th);

        if (idx >= 0) {
            th.classList.add("sorted");
            th.classList.add(__SORT_STATE__[idx].dir === "asc" ? "asc" : "desc");
            th.setAttribute("data-order", String(idx + 1));
        }
    });
}

function __setupSorter({ tableId, keyByIndex, defaultKey }) {
    __SORT_TABLE_ID__ = tableId;
    __SORT_KEY_BY_INDEX__ = keyByIndex;

    if (__SORT_INIT_DONE__) return;
    __SORT_INIT_DONE__ = true;

    const table = document.getElementById(tableId);
    if (!table) return;

    const ths = table.querySelectorAll("thead th");
    ths.forEach((th, idx) => {
        const key = keyByIndex[idx];
        if (!key) return;
        th.setAttribute("data-key", key);
        __ensureSortIcon(th);
    });

    if (defaultKey) __SORT_STATE__ = [{ key: defaultKey, dir: "asc" }];

    table.querySelector("thead")?.addEventListener("click", (e) => {
        const th = e.target.closest("th[data-key]");
        if (!th) return;
        const key = th.getAttribute("data-key");
        if (!key) return;

        const shift = e.shiftKey;
        const existing = __SORT_STATE__.find(s => s.key === key);

        if (!shift) {
            if (!existing) {
                __SORT_STATE__ = [{ key, dir: "asc" }];
            } else {
                const nextDir = existing.dir === "asc" ? "desc" : "asc";
                __SORT_STATE__ = [{ key, dir: nextDir }];
            }
        } else {
            if (!existing) __SORT_STATE__.push({ key, dir: "asc" });
            else existing.dir = existing.dir === "asc" ? "desc" : "asc";
        }

        if (typeof window.__reRenderTableHook__ === "function") {
            window.__reRenderTableHook__();
        }
        __updateSortUI();
    });

    __updateSortUI();
}

const API_BASE = "/api/settings/courses";

let courseDB = [];

const token = localStorage.getItem("token");
function authHeaders() {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

const tableBody = document.querySelector("#courseTable tbody");
const modal = document.getElementById("courseModal");
const form = document.getElementById("courseForm");

const addBtn = document.getElementById("addCourseBtn");
const cancelBtn = document.getElementById("cancelBtn");

const courseCode = document.getElementById("courseCode");
const courseName = document.getElementById("courseName");
const levelType = document.getElementById("levelType");
const status = document.getElementById("status");

let searchInput = null;
let editingId = null;

/* ================= API ================= */

async function apiList() {
    if (!token) {
        window.location.href = "/ZclassScheduler/html/Login.html";
        return [];
    }
    const res = await fetch(API_BASE, { headers: { ...authHeaders() } });
    if (!res.ok) throw new Error("Failed to load courses");
    return res.json();
}

async function apiCreate(payload) {
    const res = await fetch(API_BASE, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (res.status === 409) {
        const msg = await safeJson(res);
        throw new Error(msg?.message || "Course code must be unique.");
    }
    if (!res.ok) throw new Error("Failed to create course");
    return res.json();
}

async function apiUpdate(id, payload) {
    const res = await fetch(`${API_BASE}/${id}`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (res.status === 409) {
        const msg = await safeJson(res);
        throw new Error(msg?.message || "Course code must be unique.");
    }
    if (!res.ok) throw new Error("Failed to update course");
}

async function apiSetStatus(id, active) {
    const res = await fetch(`${API_BASE}/${id}/status`, {
        method: "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
    });
    if (!res.ok) throw new Error("Failed to update status");
}

async function apiDelete(id) {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
    if (!res.ok) throw new Error("Failed to delete course");
}

async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}

/* ================= SEARCH COMPONENT ================= */

async function loadSearchComponent() {
    const response = await fetch("/ZclassScheduler/html/GlobalSearch.html");
    const html = await response.text();

    const container = document.getElementById("searchContainer");
    if (!container) return;

    container.innerHTML = html;

    searchInput = document.querySelector("#searchInput");
    if (searchInput) searchInput.addEventListener("input", handleSearch);

    const clearBtn = container.querySelector(".clear-btn");
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

    // Default: level then course name
    __setupSorter({
        tableId: "courseTable",
        keyByIndex: ["code", "name", "levelType", "active", null],
    });
    __SORT_STATE__ = [{ key: "levelType", dir: "asc" }, { key: "name", dir: "asc" }];
    __updateSortUI();
}

/* ================= RENDER ================= */

let __lastRendered__ = null;
function renderCourses(data = courseDB) {
    __lastRendered__ = data;
    const __sorted = __applyMultiSort(data);

    tableBody.innerHTML = "";

    if (!data.length) {
        tableBody.innerHTML = `<tr><td colspan="5">No courses found.</td></tr>`;
        return;
    }

    __sorted.forEach(c => {
        const row = document.createElement("tr");
        row.dataset.id = c.id;

        row.innerHTML = `
      <td>${escapeHtml(c.code)}</td>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(levelLabel(c.levelType))}</td>
      <td class="${c.active ? "status-active" : "status-inactive"}">
        ${c.active ? "Active" : "Inactive"}
      </td>
      <td>
        <button class="btn btn-edit" data-action="edit">Edit</button>
        <button class="btn ${c.active ? "btn-warning" : "btn-success"}" data-action="toggle">
          ${c.active ? "Deactivate" : "Activate"}
        </button>
      </td>
    `;

        tableBody.appendChild(row);
    });
}

function levelLabel(v) {
    if (v === "TERTIARY") return "Tertiary";
    if (v === "SHS") return "Senior High School";
    if (v === "JHS") return "Junior High School";
    return v || "";
}

/* ================= SEARCH ================= */

function handleSearch() {
    const value = (searchInput?.value || "").toLowerCase().trim();
    const filtered = courseDB.filter(c =>
        (c.code || "").toLowerCase().includes(value) ||
        (c.name || "").toLowerCase().includes(value) ||
        (c.levelType || "").toLowerCase().includes(value) ||
        String(c.active ? "active" : "inactive").includes(value)
    );
    renderCourses(filtered);
}

/* ================= LOAD ================= */

async function loadCourses() {
    const list = await apiList();
    courseDB = (list || []).map(x => ({
        id: x.id,
        code: x.code,
        name: x.name,
        levelType: String(x.levelType),
        active: !!x.active,
    }));
    renderCourses();
}

/* ================= SAVE ================= */

form.addEventListener("submit", (e) => {
    e.preventDefault();

    const payload = {
        code: courseCode.value.trim(),
        name: courseName.value.trim(),
        levelType: levelType.value
    };

    // client-side unique check by code (nice UX)
    const dup = courseDB.find(x =>
        (x.code || "").toLowerCase() === payload.code.toLowerCase() &&
        String(x.id) !== String(editingId)
    );
    if (dup) {
        appAlert("Course code must be unique.");
        return;
    }

    (async () => {
        try {
            if (editingId) {
                await apiUpdate(editingId, payload);
                await apiSetStatus(editingId, (status.value === "Active"));
            } else {
                const created = await apiCreate(payload);
                if (created?.id && status.value === "Inactive") {
                    await apiSetStatus(created.id, false);
                }
            }

            closeModal();
            await loadCourses();
        } catch (err) {
            console.error(err);
            appAlert(err.message || "Something went wrong.");
        }
    })();
});

/* ================= TABLE ACTIONS ================= */

tableBody.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const row = e.target.closest("tr");
    const id = row.dataset.id;

    if (action === "edit") openEditModal(id);
    if (action === "toggle") toggleStatus(id);
});

function openEditModal(id) {
    const c = courseDB.find(x => String(x.id) === String(id));
    if (!c) return;

    editingId = id;
    courseCode.value = c.code;
    courseName.value = c.name;
    levelType.value = c.levelType;
    status.value = c.active ? "Active" : "Inactive";

    document.getElementById("modalTitle").textContent = "Edit Course";
    modal.classList.remove("hidden");
}

function toggleStatus(id) {
    const c = courseDB.find(x => String(x.id) === String(id));
    if (!c) return;

    (async () => {
        try {
            await apiSetStatus(id, !c.active);
            await loadCourses();
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
    document.getElementById("modalTitle").textContent = "Add Course";
    modal.classList.remove("hidden");
});

cancelBtn.addEventListener("click", closeModal);

function closeModal() {
    modal.classList.add("hidden");
    form.reset();
    editingId = null;
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

loadSearchComponent();
loadCourses().catch(err => {
    console.error(err);
    renderCourses([]);
});
