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
    const res = await fetch(API_BASE);
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
    renderRooms();
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
    const response = await fetch("../HTML/GlobalSearch.html");
    const html = await response.text();

    document.getElementById("searchContainer").innerHTML = html;

    searchInput = document.querySelector("#searchInput");

    if (searchInput) {
        searchInput.addEventListener("input", handleSearch);
    }
}

/* =========================================================
   RENDER TABLE
========================================================= */

function renderRooms(data = roomDB) {
    tableBody.innerHTML = "";

    if (data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6">No rooms found.</td>
            </tr>
        `;
        return;
    }

    data.forEach(room => {
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

/* =========================================================
   SEARCH
========================================================= */

function handleSearch() {
    const value = searchInput.value.toLowerCase().trim();

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
        alert("Room code must be unique.");
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
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error("Failed to update room");
            } else {
                const res = await fetch(API_BASE, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error("Failed to create room");
            }

            closeModal();
            await fetchRooms();
        } catch (err) {
            console.error(err);
            alert(err.message || "Something went wrong.");
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
            const res = await fetch(`${API_BASE}/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete room");
            await fetchRooms();
        } catch (err) {
            console.error(err);
            alert(err.message || "Something went wrong.");
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
fetchRooms().catch(err => {
    console.error(err);
    // Keep UX reasonable even if API is down
    renderRooms([]);
});
