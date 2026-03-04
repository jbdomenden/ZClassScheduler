/* =========================================================
   MANAGE TEACHER (DB-backed)
   - Auth is only used in login (per requirement)
========================================================= */

const ALLOWED_DEPARTMENTS = [
    "ICT", "THM", "BM", "GE",
    "ME", "MT", "NA", "HS"
];

const API_BASE = "/api/settings/teachers";

let teacherDB = [];

/* ================= DOM ================= */

const tableBody = document.querySelector("#teacherTable tbody");
const modal = document.getElementById("teacherModal");
const form = document.getElementById("teacherForm");

const addBtn = document.getElementById("addTeacherBtn");
const cancelBtn = document.getElementById("cancelBtn");

const empId = document.getElementById("empId");
const empFn = document.getElementById("empFn");
const empLn = document.getElementById("empLn");
const departmentSelect = document.getElementById("type");
const email = document.getElementById("email");
const password = document.getElementById("password");
const role = document.getElementById("role");
const status = document.getElementById("status");

let searchInput = null;
let editingId = null;


const currentUserRole = "Super_Admin"; // This should come from backend

if (currentUserRole === "Super_Admin") {
    const select = document.getElementById("role");

    const option = document.createElement("option");
    option.value = "Super_Admin";
    option.textContent = "Super Admin";

    select.appendChild(option);
}

/* ================= API ================= */

async function fetchTeachers() {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error("Failed to load teachers");
    const data = await res.json();

    // API returns no password by design; UI still displays masked password.
    // Keep password field locally only for edit UX; if user edits, it will be sent.
    teacherDB = (data || []).map(t => {
        const existing = teacherDB.find(x => String(x.id) === String(t.id));
        return {
            id: t.id,
            empId: t.empId || "",
            firstName: t.firstName,
            lastName: t.lastName,
            department: t.department,
            email: t.email,
            password: existing?.password || "", // unknown unless created/edited in this session
            role: t.role || "Teacher",
            status: t.status || "Active",
        };
    });

    renderTeachers();
}

async function apiCreateTeacher(payload) {
    const res = await fetch(API_BASE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (res.status === 409) {
        const msg = await safeJson(res);
        throw new Error(msg?.message || "Duplicate teacher.");
    }
    if (!res.ok) throw new Error("Failed to update teacher");
}

async function apiDeleteTeacher(id) {
    const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete teacher");
}

async function safeJson(res) {
    try { return await res.json(); } catch { return null; }
}

/* ================= SEARCH LOAD ================= */

async function loadSearchComponent() {
    const response = await fetch("../HTML/GlobalSearch.html");
    const html = await response.text();
    document.getElementById("searchContainer").innerHTML = html;

    searchInput = document.querySelector("#searchInput");

    if (searchInput) {
        searchInput.addEventListener("input", handleSearch);
    }
}

/* ================= RENDER ================= */

function renderTeachers(data = teacherDB) {
    tableBody.innerHTML = "";

    if (!data.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9">No teachers found.</td>
            </tr>
        `;
        return;
    }

    data.forEach(teacher => {
        const row = document.createElement("tr");
        row.dataset.id = teacher.id;

        row.innerHTML = `
            <td>${escapeHtml(teacher.empId)}</td>
            <td>${escapeHtml(teacher.firstName)}</td>
            <td>${escapeHtml(teacher.lastName)}</td>
            <td>${escapeHtml(teacher.department)}</td>
            <td>${escapeHtml(teacher.email)}</td>
            <td>••••••••</td>
            <td>${escapeHtml(teacher.role)}</td>
            <td class="${teacher.status === 'Active' ? 'status-active' : 'status-inactive'}">
                ${escapeHtml(teacher.status)}
            </td>
            <td>
                <button class="btn btn-edit" data-action="edit">Edit</button>
                <button class="btn btn-delete" data-action="delete">Delete</button>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

/* ================= SEARCH ================= */

function handleSearch() {
    const value = (searchInput?.value || "").toLowerCase().trim();

    const filtered = teacherDB.filter(t =>
        (t.empId || "").toLowerCase().includes(value) ||
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

    if (!ALLOWED_DEPARTMENTS.includes(departmentSelect.value)) {
        alert("Invalid department.");
        return;
    }

    const newTeacher = {
        empId: empId.value.trim(),
        firstName: empFn.value.trim().toUpperCase(),
        lastName: empLn.value.trim().toUpperCase(),
        department: departmentSelect.value,
        email: email.value.trim(),
        password: password.value.trim(),
        role: role.value,
        status: status.value
    };

    const duplicateEmp = teacherDB.find(t =>
        (t.empId || "").toLowerCase() === newTeacher.empId.toLowerCase() &&
        String(t.id) !== String(editingId)
    );
    if (duplicateEmp) {
        alert("Employee ID must be unique.");
        return;
    }

    const duplicateEmail = teacherDB.find(t =>
        (t.email || "").toLowerCase() === newTeacher.email.toLowerCase() &&
        String(t.id) !== String(editingId)
    );
    if (duplicateEmail) {
        alert("Email must be unique.");
        return;
    }

    (async () => {
        try {
            if (editingId) {
                await apiUpdateTeacher(editingId, newTeacher);
            } else {
                await apiCreateTeacher(newTeacher);
            }

            if (editingId) {
                const idx = teacherDB.findIndex(t => String(t.id) === String(editingId));
                if (idx >= 0) teacherDB[idx].password = newTeacher.password;
            }

            closeModal();
            await fetchTeachers();
        } catch (err) {
            console.error(err);
            alert(err.message || "Something went wrong.");
        }
    })();
});

/* ================= ACTIONS ================= */

tableBody.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const row = e.target.closest("tr");
    const id = row.dataset.id;

    if (action === "edit") openEditModal(id);
    if (action === "delete") deleteTeacher(id);
});

/* ================= EDIT ================= */

function openEditModal(id) {
    const teacher = teacherDB.find(t => String(t.id) === String(id));
    if (!teacher) return;

    editingId = id;

    empId.value = teacher.empId;
    empFn.value = teacher.firstName;
    empLn.value = teacher.lastName;
    departmentSelect.value = teacher.department;
    email.value = teacher.email;
    password.value = teacher.password || "";
    role.value = teacher.role;
    status.value = teacher.status || "Active";

    document.getElementById("modalTitle").textContent = "Edit Teacher";
    modal.classList.remove("hidden");
}

/* ================= DELETE ================= */

function deleteTeacher(id) {
    if (!confirm("Delete this teacher?")) return;

    (async () => {
        try {
            await apiDeleteTeacher(id);
            await fetchTeachers();
        } catch (err) {
            console.error(err);
            alert(err.message || "Something went wrong.");
        }
    })();
}

/* ================= MODAL ================= */

addBtn.addEventListener("click", () => {
    editingId = null;
    form.reset();
    document.getElementById("modalTitle").textContent = "Add Teacher";
    modal.classList.remove("hidden");
});

cancelBtn.addEventListener("click", closeModal);

function closeModal() {
    modal.classList.add("hidden");
    form.reset();
    editingId = null;
}

empFn.addEventListener("input", autoGenerateCredentials);
empLn.addEventListener("input", autoGenerateCredentials);

function autoGenerateCredentials() {
    const first = empFn.value.trim().toLowerCase().replace(/\s+/g, "");
    const last  = empLn.value.trim().toLowerCase().replace(/\s+/g, "");

    if (first && last) {
        email.value = `${first}.${last}@zcs.edu`;
        password.value = `${first.charAt(0)}${last}`;
    }
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
fetchTeachers().catch(err => {
    console.error(err);
    renderTeachers([]);
});
