/* =============================================================================================
   SCHEDULE ENGINE
   Centralized timetable rendering logic
============================================================================================== */

const START_MIN = 7 * 60;
const END_MIN   = 21 * 60;
const INTERVAL  = 30;

const DAYS = ["MON","TUE","WED","THU","FRI","SAT"];


/* =============================================================================================
   UTILITIES
============================================================================================== */

function toMin(t){
    const [h,m] = t.split(":").map(Number);
    return h*60 + m;
}

function fmt(min){
    const h = Math.floor(min/60);
    const m = min%60;
    const ap = h >= 12 ? "PM" : "AM";
    const hr = ((h + 11) % 12) + 1;
    return `${hr}:${m.toString().padStart(2,"0")} ${ap}`;
}


/* =============================================================================================
   BUILD BLANK GRID
============================================================================================== */

function buildGrid(tbody) {

    tbody.innerHTML = "";

    for (let t = START_MIN; t < END_MIN; t += INTERVAL) {

        const tr = document.createElement("tr");

        const startTd = document.createElement("td");
        startTd.className = "time-col";
        startTd.textContent = fmt(t);
        tr.appendChild(startTd);

        const endTd = document.createElement("td");
        endTd.className = "time-col";
        endTd.textContent = fmt(t + INTERVAL);
        tr.appendChild(endTd);

        DAYS.forEach(() => {
            tr.appendChild(document.createElement("td"));
        });

        tbody.appendChild(tr);
    }
}


/* =============================================================================================
   RENDER ENTRIES
============================================================================================== */

function renderEntries(tbody, entries, templateCallback) {

    const rows = tbody.querySelectorAll("tr");

    entries.forEach(entry => {

        const startMin = toMin(entry.start);
        const endMin   = toMin(entry.end);
        const span     = (endMin - startMin) / INTERVAL;

        const rowIndex = (startMin - START_MIN) / INTERVAL;
        const dayIndex = DAYS.indexOf(entry.day);

        if (rowIndex < 0 || dayIndex < 0) return;

        const row = rows[rowIndex];
        const cell = row.children[dayIndex + 2]; // +2 for time columns

        if (!cell) return;

        cell.rowSpan = span;
        cell.className = entry.type || "";
        if (entry.conflict) cell.classList.add("conflict-cell");
        if (entry.conflictRemarks) cell.title = String(entry.conflictRemarks);

        cell.innerHTML = templateCallback(entry);

        /* 🔥 Remove overlapped cells */
        for (let i = 1; i < span; i++) {

            const nextRow = rows[rowIndex + i];
            if (!nextRow) continue;

            const nextCell = nextRow.children[dayIndex + 2];
            if (nextCell) nextCell.remove();
        }
    });
}


/* =============================================================================================
   PUBLIC API
============================================================================================== */

export function renderSchedule(tbodyId, entries, templateCallback) {

    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    buildGrid(tbody);

    if (!entries || !entries.length) return;

    renderEntries(tbody, entries, templateCallback);
}
