/* =============================================================================================
   TEACHER MODULE (Backend-connected, ALL DEPARTMENTS)

   - Teachers:   GET /api/settings/teachers
   - Rooms:      GET /api/settings/rooms
   - Schedules:  GET /api/scheduler/{jhs|shs|tertiary|namei}/blocks

   Renders weekly grid using ScheduleGridEngine.js
============================================================================================= */

import { createSearchDropdown } from "./base.js";
import { renderSchedule } from "./ScheduleGridEngine.js";

const API = {
  teachers: "/api/settings/teachers",
  rooms: "/api/settings/rooms",
  blocks: [
    "/api/scheduler/jhs/blocks",
    "/api/scheduler/shs/blocks",
    "/api/scheduler/tertiary/blocks",
    "/api/scheduler/namei/blocks",
  ],
};

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

async function fetchAllBlocks(urls) {
  const results = await Promise.all(urls.map((u) => fetchJson(u).catch(() => [])));
  return results.flat();
}

function toUiDay(day) {
  if (!day) return null;
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
  return map[d] || null;
}

function toHHMM(value) {
  if (!value) return "";
  let s = String(value).trim();
  s = s.split(/\s*[-–—]\s*/)[0].trim();

  let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;

  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;

  m = s.match(/^(\d{1,2})\s*:\s*(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";

  let hh = parseInt(m[1], 10);
  const mm = m[2];
  const ap = String(m[3]).toUpperCase();

  if (hh === 12) hh = 0;
  if (ap === "PM") hh += 12;

  return `${String(hh).padStart(2, "0")}:${mm}`;
}

function isGridAligned(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return false;

  const sm = startHHMM.split(":").map(Number);
  const em = endHHMM.split(":").map(Number);
  if (sm.length < 2 || em.length < 2) return false;
  if (sm.some((n) => !Number.isFinite(n)) || em.some((n) => !Number.isFinite(n))) return false;

  const startMin = sm[0] * 60 + sm[1];
  const endMin = em[0] * 60 + em[1];

  if (startMin < 7 * 60 || endMin > 21 * 60) return false;
  if (startMin % 30 !== 0 || endMin % 30 !== 0) return false;
  if ((endMin - startMin) <= 0 || (endMin - startMin) % 30 !== 0) return false;

  return true;
}

function teacherFullName(t) {
  if (!t) return "—";
  return `${t.department || ""} ${t.firstName || ""} ${t.lastName || ""}`
    .replace(/\s+/g, " ")
    .trim() || "—";
}

/* =============================================================================================
   LOAD DATA
============================================================================================= */

async function loadTeacherScheduleData() {
  const [teachersRaw, roomsRaw, blocksRaw] = await Promise.all([
    fetchJson(API.teachers).catch(() => []),
    fetchJson(API.rooms).catch(() => []),
    fetchAllBlocks(API.blocks).catch(() => []),
  ]);

  const teachers = (teachersRaw || [])
    .filter((t) => (t.status || "Active").toLowerCase() === "active")
    .map((t) => ({ id: String(t.id), label: teacherFullName(t) }));

  const teacherById = new Map((teachersRaw || []).map((t) => [String(t.id), t]));
  const roomById = new Map((roomsRaw || []).map((r) => [String(r.id), r.code]));

  const entries = [];

  (blocksRaw || []).forEach((block) => {
    const section = block.sectionCode;

    (block.rows || []).forEach((row) => {
      const day = toUiDay(row.dayOfWeek);
      const start = toHHMM(row.timeStart);
      const end = toHHMM(row.timeEnd);
      if (!day || !start || !end) return;
      if (!isGridAligned(start, end)) return;

      const teacherId = row.teacherId ? String(row.teacherId) : null;
      if (!teacherId) return;

      const teacher = teacherById.get(teacherId);
      if (!teacher) return;

      entries.push({
        day,
        start,
        end,
        type: row.isElective ? "Elective" : "Regular",

        teacherLabel: teacherFullName(teacher),

        code: row.subjectCode || "—",
        name: row.subjectName || "—",
        section: section || "—",
        room: row.roomId ? (roomById.get(String(row.roomId)) || "—") : "—",
      });
    });
  });

  return {
    teachers: teachers.map((t) => t.label).sort((a, b) => a.localeCompare(b)),
    entries,
  };
}

/* =============================================================================================
   INIT
============================================================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const title = document.getElementById("teacherTitle");

  renderSchedule("teacherGrid", [], () => "");

  let teachers = [];
  let entries = [];

  try {
    const data = await loadTeacherScheduleData();
    teachers = data.teachers;
    entries = data.entries;
  } catch (err) {
    console.error("Failed loading teacher schedule", err);
  }

  createSearchDropdown({
    inputId: "teacherSearch",
    dropdownId: "teacherDropdown",
    clearBtnId: "clearTeacherSearch",
    data: teachers,

    onSelect: (teacherLabel) => {
      const teacherEntries = entries.filter((e) => e.teacherLabel === teacherLabel);

      if (title) title.textContent = `Weekly Teacher Schedule - ${teacherLabel}`;

      renderSchedule("teacherGrid", teacherEntries, (e) => `
        <strong>${e.code}</strong><br>
        ${e.name}<br>
        <strong>${e.section}</strong><br>
        ${e.room}<br>
      `);
    },

    onClear: () => {
      if (title) title.textContent = "Weekly Teacher Schedule";
      renderSchedule("teacherGrid", [], () => "");
    },
  });
});