// DASHBOARD INDEX JS
// Handles:
// 1) Room Overview grid (rowspan-based schedule layout aligned to time start/end)
// 2) Incomplete Schedule panel

const API_BASE = "/api";
const token = localStorage.getItem("token");

/**
 * Performs authenticated GET request and returns parsed JSON.
 * Adds Bearer token from localStorage.
 * Throws error if response is not OK.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function authFetchJson(url) {
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
    });

    if (!res.ok) throw new Error("Request failed");
    return await res.json();
}

/**
 * Loads and renders the Room Overview table.
 * Builds a 30-minute interval grid (7:00–21:00).
 * Uses rowspan to visually span scheduled time blocks.
 */
async function loadRoomOverview() {
    const table = document.getElementById("roomOverviewTable");
    if (!table) return;

    const tbody = table.querySelector("tbody");
    tbody.innerHTML = "";

    const data = await authFetchJson(`${API_BASE}/dashboard/rooms`);

    // Unique room list sorted alphabetically.
    const rooms = [...new Set(data.map((d) => d.roomCode))].sort();

    // Generate 30-min time slots from 07:00 to 21:00.
    const startHour = 7;
    const endHour = 21;
    const interval = 30;

    const times = [];
    for (let h = startHour; h < endHour; h++) {
        times.push(`${pad(h)}:00`);
        times.push(`${pad(h)}:30`);
    }

    // Initialize empty grid: time -> room -> cell data.
    const grid = {};
    times.forEach((t) => {
        grid[t] = {};
        rooms.forEach((r) => (grid[t][r] = null));
    });

    /**
     * Place schedules into grid:
     * - First time slot gets actual content + rowspan
     * - Subsequent covered slots marked as "skip"
     */
    data.forEach((s) => {
        const startIndex = times.indexOf(s.startTime);
        const endIndex = times.indexOf(s.endTime);
        if (startIndex === -1 || endIndex === -1) return;

        const span = endIndex - startIndex;

        grid[times[startIndex]][s.roomCode] = {
            rowspan: span,
            content: `
        <div class="sched-block">
          <div><strong>${escapeHtml(s.subject)}</strong></div>
          <div>${escapeHtml(s.section)}</div>
          <div>${escapeHtml(s.teacher)}</div>
        </div>
      `,
        };

        for (let i = startIndex + 1; i < endIndex; i++) {
            grid[times[i]][s.roomCode] = "skip";
        }
    });

    // Render table rows.
    times.forEach((time, i) => {
        const row = document.createElement("tr");

        // TIME START column.
        const tdStart = document.createElement("td");
        tdStart.textContent = time;
        row.appendChild(tdStart);

        // TIME END column.
        const tdEnd = document.createElement("td");
        tdEnd.textContent = times[i + 1] || "";
        row.appendChild(tdEnd);

        // Room columns.
        rooms.forEach((room) => {
            const cellData = grid[time][room];
            if (cellData === "skip") return;

            const td = document.createElement("td");

            if (cellData && cellData.rowspan > 0) {
                td.rowSpan = cellData.rowspan;
                td.innerHTML = cellData.content;
                td.classList.add("occupied");
            }

            row.appendChild(td);
        });

        tbody.appendChild(row);
    });
}

/**
 * Loads and renders the Incomplete Schedules panel.
 * Displays schedules missing day, time, teacher, or room.
 */
async function loadIncompleteSchedules() {
    const tbody = document.getElementById("incompleteGrid");
    if (!tbody) return;

    tbody.innerHTML = "";

    const data = await authFetchJson(`${API_BASE}/dashboard/incomplete`);

    if (!data.length) {
        tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center">All schedules complete 🎉</td>
      </tr>
    `;
        return;
    }

    data.forEach((s) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
      <td>${escapeHtml(s.subject)}</td>
      <td>${escapeHtml(s.section)}</td>
      <td>${badge(s.day)}</td>
      <td>${badge(s.time)}</td>
      <td>${badge(s.teacher)}</td>
      <td>${badge(s.room)}</td>
    `;
        tbody.appendChild(tr);
    });
}

/**
 * Returns a styled badge.
 * If value is missing/null, shows "Missing" badge.
 * @param {string|null|undefined} value
 * @returns {string} HTML string
 */
function badge(value) {
    if (!value) return `<span class="badge-missing">Missing</span>`;
    return escapeHtml(value);
}

/**
 * Pads a number with leading zero (e.g., 7 -> "07").
 * @param {number} n
 * @returns {string}
 */
function pad(n) {
    return n.toString().padStart(2, "0");
}

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, function (m) {
        return {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
        }[m];
    });
}

// Initialize dashboard modules on DOM ready.
document.addEventListener("DOMContentLoaded", () => {
    loadRoomOverview();
    loadIncompleteSchedules();
});