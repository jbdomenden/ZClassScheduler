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

const token = localStorage.getItem("token");
const UNSET = "\u2014";

const API = {
    blocksAll: [
        { source: "STI", url: "/api/scheduler/tertiary/blocks" },
        { source: "NAMEI", url: "/api/scheduler/namei/blocks" },
        { source: "SHS", url: "/api/scheduler/shs/blocks" },
        { source: "JHS", url: "/api/scheduler/jhs/blocks" },
    ],
    teachers: "/api/settings/teachers",
    rooms: "/api/settings/rooms",
};

let OVERVIEW_DB = [];

async function fetchJson(url) {
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Accept": "application/json",
        },
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    return await res.json();
}

function toUiDay(day) {
    if (!day) return UNSET;
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

function toMin(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
    return h * 60 + mm;
}

function isUnset(v) {
    const s = String(v ?? "").trim();
    return !s || s === UNSET;
}

function markConflicts(entries) {
    const enriched = entries
        .map((e, idx) => ({
            idx,
            section: String(e.sectionKey || e.section || "").trim(),
            day: String(e.day || "").trim(),
            room: String(e.room || "").trim(),
            teacher: `${e.teacherDept} ${e.teacherFN} ${e.teacherLN}`.trim(),
            start: String(e.start || "").trim(),
            end: String(e.end || "").trim(),
            sm: toMin(e.start),
            em: toMin(e.end),
        }))
        .filter((e) => !isUnset(e.day) && e.sm != null && e.em != null && e.em > e.sm);

    const conflictIdx = new Set();
    const remarksByIdx = new Map(); // idx -> Set<string>

    function addRemark(aIdx, remark) {
        if (!remark) return;
        if (!remarksByIdx.has(aIdx)) remarksByIdx.set(aIdx, new Set());
        const set = remarksByIdx.get(aIdx);
        if (set.size >= 10) return; // cap
        set.add(String(remark));
    }

    function entryLabel(i) {
        const e = entries[i];
        if (!e) return UNSET;
        const src = String(e.source || "").trim();
        const sec = String(e.section || "").trim();
        const code = String(e.code || "").trim();
        const subj = String(e.subject || "").trim();
        const who = [src, sec].filter(Boolean).join(" ");
        const what = [code, subj].filter((x) => x && x !== UNSET).join(" - ");
        return [who, what].filter(Boolean).join(" | ") || UNSET;
    }

    function sweep(kind, keyFn) {
        const map = new Map();
        enriched.forEach((e) => {
            const k = keyFn(e);
            if (!k) return;
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(e);
        });

        map.forEach((list) => {
            list.sort((a, b) => a.sm - b.sm);
            for (let i = 0; i < list.length; i++) {
                const a = list[i];
                for (let j = i + 1; j < list.length && list[j].sm < a.em; j++) {
                    const b = list[j];
                    if (a.sm < b.em && b.sm < a.em) {
                        conflictIdx.add(a.idx);
                        conflictIdx.add(b.idx);

                        // Add symmetric remarks
                        const aKey = keyFn(a);
                        const bKey = keyFn(b);
                        const keyValue = String((aKey || bKey || "")).split("|").slice(2).join("|") || UNSET;
                        const whenA = `${a.day} ${a.start || UNSET}-${a.end || UNSET}`;
                        const whenB = `${b.day} ${b.start || UNSET}-${b.end || UNSET}`;
                        addRemark(a.idx, `${kind} conflict (${keyValue}): overlaps with ${entryLabel(b.idx)} at ${whenA}`);
                        addRemark(b.idx, `${kind} conflict (${keyValue}): overlaps with ${entryLabel(a.idx)} at ${whenB}`);
                    }
                }
            }
        });
    }

    // Section conflict: a section can't have overlapping classes on the same day/time.
    sweep("SECTION", (e) => (!isUnset(e.section) ? `${e.day}|SECTION|${e.section}` : null));

    // IMPORTANT: ignore conflicts for unset Room/Teacher placeholders
    sweep("ROOM", (e) => (!isUnset(e.room) ? `${e.day}|ROOM|${e.room}` : null));
    sweep("TEACHER", (e) => (!isUnset(e.teacher) ? `${e.day}|TEACHER|${e.teacher}` : null));

    return entries.map((e, idx) => {
        const remarks = remarksByIdx.has(idx) ? Array.from(remarksByIdx.get(idx)) : [];
        return { ...e, conflict: conflictIdx.has(idx), conflictRemarks: remarks };
    });
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
    const [blocksAll, teachersRaw, roomsRaw] = await Promise.all([
        Promise.all(
            (API.blocksAll || []).map(async (src) => {
                try {
                    const payload = await fetchJson(src.url);
                    // most endpoints return an array, but accept {blocks:[...]} too
                    const blocks = Array.isArray(payload) ? payload : (payload?.blocks || []);
                    return { source: src.source, blocks: blocks || [] };
                } catch (e) {
                    console.warn("Failed to load blocks:", src, e);
                    return { source: src.source, blocks: [] };
                }
            })
        ),
        fetchJson(API.teachers).catch(() => []),
        fetchJson(API.rooms).catch(() => []),
    ]);

    const teacherById = new Map((teachersRaw || []).map(t => [String(t.id), t]));
    const roomById = new Map((roomsRaw || []).map(r => [String(r.id), r.code]));

    const list = [];

    (blocksAll || []).forEach(({ source, blocks }) => {
        (blocks || []).forEach((block) => {
            const rawSection = block.sectionCode || block.section || UNSET;
            const section = rawSection || UNSET;
            const sectionKey = `${String(source || "UNK")}|${String(section)}`;
            const curriculum = block.curriculumName || block.curriculumId || UNSET;

            (block.rows || []).forEach((row) => {
                const day = toUiDay(row.dayOfWeek);
                const start = row.timeStart || UNSET;
                const end = row.timeEnd || UNSET;

                const room = row.roomId ? (roomById.get(String(row.roomId)) || UNSET) : UNSET;
                const teacher = row.teacherId ? teacherById.get(String(row.teacherId)) : null;
                const t = teacherParts(teacher);

                list.push({
                    source: String(source || "UNK"),
                    sectionKey,
                    section,
                    curriculum,

                    code: row.subjectCode || UNSET,
                    subject: row.subjectName || UNSET,
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
    });

    // Stable grouping + nicer display
    list.sort((a, b) => {
        const s = String(a.section).localeCompare(String(b.section));
        if (s !== 0) return s;
        const d = String(a.day).localeCompare(String(b.day));
        if (d !== 0) return d;
        return String(a.start).localeCompare(String(b.start));
    });

    return markConflicts(list);
}

/* =============================================================================================
   SEARCH MATCH
============================================================================================= */

function matchesSearch(entry, keyword) {

    const teacher = `${entry.teacherDept} ${entry.teacherFN} ${entry.teacherLN}`;

    const searchableString = `
        ${entry.source}
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

    const renderWithSearch = () => {
        const keyword = input.value.trim();
        if (!keyword) {
            renderScheduleList("scheduleTable", OVERVIEW_DB);
            return;
        }
        const filtered = OVERVIEW_DB.filter(entry => matchesSearch(entry, keyword));
        renderScheduleList("scheduleTable", filtered);
    };

    input.addEventListener("input", renderWithSearch);

    clearBtn?.addEventListener("click", () => {
        input.value = "";
        renderScheduleList("scheduleTable", OVERVIEW_DB);
    });

    // return helper for refresh usage
    return renderWithSearch;
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
    const renderWithSearch = initSearch() || null;

    const refreshBtn = document.getElementById("refreshOverviewBtn");
    const dlBtn = document.getElementById("downloadOverviewExcelBtn");
    refreshBtn?.addEventListener("click", async () => {
        if (refreshBtn) refreshBtn.disabled = true;
        try {
            OVERVIEW_DB = await loadOverviewData();
            if (renderWithSearch) renderWithSearch();
            else renderScheduleList("scheduleTable", OVERVIEW_DB);
        } catch (e) {
            console.error("Refresh failed", e);
            appAlert(e.message || "Failed to refresh schedules.");
        } finally {
            if (refreshBtn) refreshBtn.disabled = false;
        }
    });

    dlBtn?.addEventListener("click", () => {
        if (typeof window.downloadTableAsCsv !== "function") {
            appAlert("Download is not available right now.");
            return;
        }
        window.downloadTableAsCsv("scheduleTable", "AllSchedules");
    });

    try {
        OVERVIEW_DB = await loadOverviewData();
    } catch (err) {
        console.error("Failed to load overview data", err);
        OVERVIEW_DB = [];
    }

    // Default render (show all data)
    renderScheduleList("scheduleTable", OVERVIEW_DB);

    // Ensure initial render respects whatever is already typed (rare but safe)
    if (renderWithSearch) renderWithSearch();
});
