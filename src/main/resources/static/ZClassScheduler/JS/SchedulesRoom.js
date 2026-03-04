/* =============================================================================================
   ROOM MODULE (Backend-connected, ALL DEPARTMENTS)
   - Rooms:      GET /api/settings/rooms
   - Teachers:   GET /api/settings/teachers
   - Schedules:  GET /api/scheduler/{jhs|shs|tertiary|namei}/blocks

   Renders weekly grid using ScheduleGridEngine.js
============================================================================================= */

import { createSearchDropdown } from "./base.js";
import { renderSchedule } from "./ScheduleGridEngine.js";

const API = {
  rooms: "/api/settings/rooms",
  teachers: "/api/settings/teachers",
  blocks: [
    "/api/scheduler/jhs/blocks",
    "/api/scheduler/shs/blocks",
    "/api/scheduler/tertiary/blocks",
    "/api/scheduler/namei/blocks",
  ],
};

/* =============================================================================================
   HELPERS
============================================================================================= */

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

async function fetchAllBlocks(urls) {
  const results = await Promise.all(
    urls.map((u) => fetchJson(u).catch(() => []))
  );
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

  // "7:00 AM - 9:00 AM" -> take first
  s = s.split(/\s*[-–—]\s*/)[0].trim();

  // HH:mm:ss -> HH:mm
  let m = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;

  // HH:mm -> HH:mm
  m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;

  // h:mm AM/PM
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

  // Engine grid is 07:00–21:00, 30-min slots
  if (startMin < 7 * 60 || endMin > 21 * 60) return false;
  if (startMin % 30 !== 0 || endMin % 30 !== 0) return false;
  if ((endMin - startMin) <= 0 || (endMin - startMin) % 30 !== 0) return false;

  return true;
}

function teacherFullName(t) {
  if (!t) return "—";
  const dept = (t.department || "").trim();
  const fn = (t.firstName || "").trim();
  const ln = (t.lastName || "").trim();
  return `${dept} ${fn} ${ln}`.replace(/\s+/g, " ").trim() || "—";
}

/* =============================================================================================
   DATA LOAD
============================================================================================= */

async function loadRoomScheduleData() {
  const [roomsRaw, teachersRaw, blocksRaw] = await Promise.all([
    fetchJson(API.rooms).catch(() => []),
    fetchJson(API.teachers).catch(() => []),
    fetchAllBlocks(API.blocks).catch(() => []),
  ]);

  const rooms = (roomsRaw || [])
    .filter((r) => (r.status || "Active").toLowerCase() === "active")
    .map((r) => ({ id: String(r.id), code: String(r.code || "").trim() }))
    .filter((r) => r.id && r.code);

  const roomCodeById = new Map(rooms.map((r) => [String(r.id), String(r.code)]));

  const teachers = (teachersRaw || [])
    .filter((t) => t && t.id)
    .map((t) => ({
      id: String(t.id),
      department: t.department,
      firstName: t.firstName,
      lastName: t.lastName,
    }));
  const teacherById = new Map(teachers.map((t) => [String(t.id), t]));

  const entries = [];

  (blocksRaw || []).forEach((block) => {
    const section = block.sectionCode;

    (block.rows || []).forEach((row) => {
      const day = toUiDay(row.dayOfWeek);
      const start = toHHMM(row.timeStart);
      const end = toHHMM(row.timeEnd);
      if (!day || !start || !end) return;
      if (!isGridAligned(start, end)) return;

      const roomCode = row.roomId ? roomCodeById.get(String(row.roomId)) : null;
      if (!roomCode) return;

      const teacher = row.teacherId ? teacherById.get(String(row.teacherId)) : null;

      entries.push({
        // required by ScheduleGridEngine
        day,
        start,
        end,
        type: row.isElective ? "Elective" : "Regular",

        // filter key
        room: roomCode,

        // cell content
        code: row.subjectCode || "—",
        name: row.subjectName || "—",
        section: section || "—",
        teacherLabel: teacherFullName(teacher),
      });
    });
  });

  return {
    rooms: rooms.map((r) => r.code).sort((a, b) => a.localeCompare(b)),
    entries,
  };
}

/* =============================================================================================
   INIT
============================================================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const title = document.getElementById("roomTitle");

  renderSchedule("roomGrid", [], () => "");

  let rooms = [];
  let entries = [];

  try {
    const data = await loadRoomScheduleData();
    rooms = data.rooms;
    entries = data.entries;
  } catch (err) {
    console.error("Failed to load room schedule data", err);
  }

  createSearchDropdown({
    inputId: "roomSearch",
    dropdownId: "roomDropdown",
    clearBtnId: "clearRoomSearch",
    data: rooms,

    onSelect: (room) => {
      const roomEntries = entries.filter((e) => e.room === room);

      if (title) title.textContent = `Weekly Room Schedule - ${room}`;

      renderSchedule("roomGrid", roomEntries, (e) => `
        <strong>${e.code}</strong><br>
        ${e.name}<br>
        <strong>${e.section}</strong><br>
        ${e.teacherLabel}<br>
      `);
    },

    onClear: () => {
      if (title) title.textContent = "Weekly Room Schedule";
      renderSchedule("roomGrid", [], () => "");
    },
  });
});