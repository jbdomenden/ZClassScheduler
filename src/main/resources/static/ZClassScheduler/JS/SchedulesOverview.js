/* =============================================================================================
   OVERVIEW MODULE (Backend-connected)
   - Uses ScheduleListEngine
   - Uses search.html UI

   Backend sources:
     - GET /api/scheduler/tertiary/blocks
     - GET /api/settings/teachers
     - GET /api/settings/rooms
============================================================================================= */

import { renderScheduleList } from "./ScheduleListEngine.js";

const API = {
    blocks: "/api/scheduler/tertiary/blocks",
    teachers: "/api/settings/teachers",
    rooms: "/api/settings/rooms",
};

let OVERVIEW_DB = [];

async function fetchJson(url) {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    return await res.json();
}

function toUiDay(day) {
    if (!day) return "—";
    const d = String(day).trim().toUpperCase();
    if (["MON", "TUE", "WED", "THU", "FRI", "SAT"].includes(d)) return d;

    const map = {
        MONDAY: "MON",
        TUESDAY: "TUE",
        WEDNESDAY: "WED",
        THURSDAY: "THU",
        FRIDAY: "FRI",
        SATURDAY: "SAT",
    };
    return map[d] || d;
}

function teacherParts(t) {
    if (!t) return { dept: "", fn: "", ln: "" };
    return {
        dept: t.department || "",
        fn: t.firstName || "",
        ln: t.lastName || "",
    };
}

async function loadOverviewData() {
    const [blocksRaw, teachersRaw, roomsRaw] = await Promise.all([
        fetchJson(API.blocks).catch(() => []),
        fetchJson(API.teachers).catch(() => []),
        fetchJson(API.rooms).catch(() => []),
    ]);

    const teacherById = new Map((teachersRaw || []).map(t => [String(t.id), t]));
    const roomById = new Map((roomsRaw || []).map(r => [String(r.id), r.code]));

    const list = [];

    (blocksRaw || []).forEach(block => {
        const section = block.sectionCode || "—";
        const curriculum = block.curriculumName || block.curriculumId || "—";

        (block.rows || []).forEach(row => {
            const day = toUiDay(row.dayOfWeek);
            const start = row.timeStart || "—";
            const end = row.timeEnd || "—";

            const room = row.roomId ? (roomById.get(String(row.roomId)) || "—") : "—";
            const teacher = row.teacherId ? teacherById.get(String(row.teacherId)) : null;
            const t = teacherParts(teacher);

            list.push({
                section,
                curriculum,

                code: row.subjectCode || "—",
                subject: row.subjectName || "—",
                type: row.isElective ? "Elective" : "Regular",

                day,
                start,
                end,
                room,

                teacherDept: t.dept,
                teacherFN: t.fn,
                teacherLN: t.ln,
            });
        });
    });

    // Stable grouping + nicer display
    list.sort((a, b) => {
        const s = String(a.section).localeCompare(String(b.section));
        if (s !== 0) return s;
        const d = String(a.day).localeCompare(String(b.day));
        if (d !== 0) return d;
        return String(a.start).localeCompare(String(b.start));
    });

    return list;
}

/* =============================================================================================
   SEARCH MATCH
============================================================================================= */

function matchesSearch(entry, keyword) {

    const teacher = `${entry.teacherDept} ${entry.teacherFN} ${entry.teacherLN}`;

    const searchableString = `
        ${entry.section}
        ${entry.code}
        ${entry.subject}
        ${entry.room}
        ${teacher}
        ${entry.day}
        ${entry.curriculum}
    `.toLowerCase();

    return searchableString.includes(keyword.toLowerCase());
}

/* =============================================================================================
   SEARCH INIT
============================================================================================= */

function initSearch() {

    const input = document.querySelector(".search-input");
    const clearBtn = document.querySelector(".clear-btn");

    if (!input) return;

    input.addEventListener("input", () => {

        const keyword = input.value.trim();

        if (keyword === "") {
            renderScheduleList("scheduleTable", OVERVIEW_DB);
            return;
        }

        const filtered = OVERVIEW_DB.filter(entry =>
            matchesSearch(entry, keyword)
        );

        renderScheduleList("scheduleTable", filtered);
    });

    clearBtn?.addEventListener("click", () => {
        input.value = "";
        renderScheduleList("scheduleTable", OVERVIEW_DB);
    });
}

/* =============================================================================================
   LOAD SEARCH COMPONENT
============================================================================================= */

async function loadSearchComponent() {

    const response = await fetch("../HTML/GlobalSearch.html");
    const html = await response.text();

    document.getElementById("searchContainer").innerHTML = html;
}

/* =============================================================================================
   INIT
============================================================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    await loadSearchComponent();

    try {
        OVERVIEW_DB = await loadOverviewData();
    } catch (err) {
        console.error("Failed to load overview data", err);
        OVERVIEW_DB = [];
    }

    // Default render (show all data)
    renderScheduleList("scheduleTable", OVERVIEW_DB);

    initSearch();
});