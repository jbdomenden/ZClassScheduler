/* =========================================================
   ROOM MANAGEMENT MODULE
   ZClassScheduler
========================================================= */

/* =========================================================
   DATA SOURCE
   (Rooms are persisted in the backend database)
========================================================= */

let roomDB = [];

const API_BASE = "/api/settings/rooms";

const token = localStorage.getItem("token");
function authHeaders() {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

let sortKey = "floor";
let sortDir = "asc";

function uiTypeToApi(type) {
    // UI values: Lecture | Laboratory | Multipurpose
    // API enum:  LECTURE | LAB | MULTIPURPOSE
    if (type === "Lecture") return "LECTURE";
    if (type === "Laboratory") return "LAB";
    return "MULTIPURPOSE";
}

function apiTypeToUi(type) {
    if (type === "LECTURE") return "Lecture";
    if (type === "LAB") return "Laboratory";
    return "Multipurpose";
}

async function fetchRooms() {
    if (!token) {
        window.location.href = "/ZClassScheduler/html/Login.html";
        return;
    }

    const res = await fetch(API_BASE, { headers: { ...authHeaders() } });
    if (!res.ok) throw new Error("Failed to load rooms");
    const data = await res.json();
    roomDB = (data || []).map(r => ({
        id: r.id,
        code: r.code,
        floor: r.floor,
        capacity: r.capacity,
        type: apiTypeToUi(r.type),
        status: r.status || "Active",
    }));

    // default sort: floor then room
    sortKey = "floor";
    sortDir = "asc";
    updateSortUI();
    renderRooms();
}

function floorSortKey(value) {
    const s = String(value || "").trim().toLowerCase();
    if (!s) return Number.POSITIVE_INFINITY;

    // Common textual floors
    if (s === "g" || s === "gf" || s.includes("ground")) return 0;
    if (s.startsWith("b") || s.includes("basement")) {
        const m = s.match(/-?\\d+/);
        const n = m ? parseInt(m[0], 10) : 1;
        return -Math.abs(n || 1);
    }

    // Numeric floors like "1", "2nd", "3rd floor"
    const m = s.match(/-?\\d+/);
    if (m) return parseInt(m[0], 10);

    // Unknown formats go last, but stay deterministic by string compare
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
    return 10000 + Math.abs(hash);
}

/* =========================================================
   DOM REFERENCES
========================================================= */

const tableBody = document.querySelector("#roomTable tbody");
const modal = document.getElementById("roomModal");
const form = document.getElementById("roomForm");

const addBtn = document.getElementById("addRoomBtn");
const cancelBtn = document.getElementById("cancelBtn");

const roomCode = document.getElementById("roomCode");
const floor = document.getElementById("floor");
const capacity = document.getElementById("capacity");
const type = document.getElementById("type");
const status = document.getElementById("status");

let searchInput = null;
let editingId = null;

/* =========================================================
   LOAD SEARCH COMPONENT
========================================================= */

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

/* =========================================================
   RENDER TABLE
========================================================= */

function renderRooms(data = roomDB) {
    tableBody.innerHTML = "";

    const sorted = applySort(data);

    if (data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6">No rooms found.</td>
            </tr>
        `;
        return;
    }

    sorted.forEach(room => {
        const row = document.createElement("tr");
        row.dataset.id = room.id;

        const roomStatus = room.status || "Active";

        row.innerHTML = `
            <td>${room.code}</td>
            <td>${room.floor}</td>
            <td>${room.capacity}</td>
            <td>${room.type}</td>
            <td class="${roomStatus === 'Active' ? 'status-active' : 'status-inactive'}">
                ${roomStatus}
            </td>
            <td>
                <button class="btn btn-edit" data-action="edit">Edit</button>
                <button class="btn btn-delete" data-action="delete">Delete</button>
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

function compareRooms(a, b) {
    const dir = sortDir === "desc" ? -1 : 1;

    function keyVal(room, key) {
        if (key === "floor") return floorSortKey(room.floor);
        if (key === "capacity") return normalizeSortVal(room.capacity);
        return normalizeSortVal(room?.[key]);
    }

    const av = keyVal(a, sortKey);
    const bv = keyVal(b, sortKey);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;

    // Default tie-breakers: floor -> room
    const f1 = floorSortKey(a.floor);
    const f2 = floorSortKey(b.floor);
    if (f1 !== f2) return f1 - f2;
    return String(a.code || "").localeCompare(String(b.code || ""));
}

function applySort(list) {
    return (list || []).slice().sort(compareRooms);
}

function updateSortUI() {
    const table = document.getElementById("roomTable");
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
    const table = document.getElementById("roomTable");
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

    // Default: floor then room
    sortKey = "floor";
    sortDir = "asc";
    updateSortUI();
}

/* =========================================================
   SEARCH
========================================================= */

function handleSearch() {
    const value = (searchInput?.value || "").toLowerCase().trim();

    const filtered = roomDB.filter(room =>
        room.code.toLowerCase().includes(value) ||
        room.floor.toLowerCase().includes(value) ||
        room.type.toLowerCase().includes(value) ||
        (room.status || "").toLowerCase().includes(value)
    );

    renderRooms(filtered);
}

/* =========================================================
   ADD / UPDATE
========================================================= */

form.addEventListener("submit", (e) => {
    e.preventDefault();

    const newRoom = {
        id: editingId ?? null,
        code: roomCode.value.trim(),
        floor: floor.value.trim(),
        capacity: parseInt(capacity.value),
        type: type.value,
        status: status.value || "Active"
    };

    // Unique room code validation
    const duplicate = roomDB.find(r =>
        r.code.toLowerCase() === newRoom.code.toLowerCase() &&
        r.id !== editingId
    );

    if (duplicate) {
        appAlert("Room code must be unique.");
        return;
    }

    // Persist to backend
    (async () => {
        try {
            const payload = {
                code: newRoom.code,
                floor: newRoom.floor,
                capacity: newRoom.capacity,
                type: uiTypeToApi(newRoom.type),
                status: newRoom.status,
            };

            if (editingId) {
                const res = await fetch(`${API_BASE}/${editingId}`, {
                    method: "PUT",
                    headers: { ...authHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error("Failed to update room");
            } else {
                const res = await fetch(API_BASE, {
                    method: "POST",
                    headers: { ...authHeaders(), "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error("Failed to create room");
            }

            closeModal();
            await fetchRooms();
        } catch (err) {
            console.error(err);
            appAlert(err.message || "Something went wrong.");
        }
    })();
});


/* =========================================================
   TABLE ACTIONS (Event Delegation)
========================================================= */

tableBody.addEventListener("click", (e) => {
    const action = e.target.dataset.action;
    if (!action) return;

    const row = e.target.closest("tr");
    const id = row.dataset.id;

    if (action === "edit") openEditModal(id);
    if (action === "delete") deleteRoom(id);
});

/* =========================================================
   EDIT
========================================================= */

function openEditModal(id) {
    const room = roomDB.find(r => String(r.id) === String(id));
    if (!room) return;

    editingId = id;

    roomCode.value = room.code;
    floor.value = room.floor;
    capacity.value = room.capacity;
    type.value = room.type;
    status.value = room.status || "Active";

    document.getElementById("modalTitle").textContent = "Edit Room";

    modal.classList.remove("hidden");
}

/* =========================================================
   DELETE
========================================================= */

function deleteRoom(id) {
    const confirmDelete = confirm("Delete this room?");
    if (!confirmDelete) return;

    (async () => {
        try {
            const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
            if (!res.ok) throw new Error("Failed to delete room");
            await fetchRooms();
        } catch (err) {
            console.error(err);
            appAlert(err.message || "Something went wrong.");
        }
    })();
}

/* =========================================================
   MODAL CONTROLS
========================================================= */

addBtn.addEventListener("click", () => {
    editingId = null;
    form.reset();
    document.getElementById("modalTitle").textContent = "Add Room";
    modal.classList.remove("hidden");
});

cancelBtn.addEventListener("click", closeModal);

function closeModal() {
    modal.classList.add("hidden");
    form.reset();
    editingId = null;
}

/* =========================================================
   INIT
========================================================= */

loadSearchComponent();
initHeaderSort();
fetchRooms().catch(err => {
    console.error(err);
    // Keep UX reasonable even if API is down
    renderRooms([]);
});
