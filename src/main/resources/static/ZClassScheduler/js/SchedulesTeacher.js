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
  me: "/api/auth/me",
  teacherBlocks: "/api/schedules/teacher-blocks",
  blocks: [
    "/api/scheduler/jhs/blocks",
    "/api/scheduler/shs/blocks",
    "/api/scheduler/tertiary/blocks",
    "/api/scheduler/namei/blocks",
  ],
};

const token = localStorage.getItem("token");

async function authFetchJson(url) {
  if (!token) throw new Error("Missing token");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  return await res.json();
}

function blockSectionLabel(block) {
  // Tertiary/SHS/NAMEI: sectionCode; JHS: section
  return String(block?.sectionCode || block?.section || "").trim();
}

function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
}

function minToHHMM(min) {
  const m = Number(min);
  if (!Number.isFinite(m)) return "";
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function mergeIntervals(intervals) {
  const list = (intervals || [])
    .map(([s, e]) => [Number(s), Number(e)])
    .filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s)
    .sort((a, b) => a[0] - b[0]);

  const out = [];
  for (const [s, e] of list) {
    const last = out[out.length - 1];
    if (!last || s > last[1]) out.push([s, e]);
    else last[1] = Math.max(last[1], e);
  }
  return out;
}

// Subtract "cuts" from [baseStart, baseEnd] and return remaining segments.
function subtractIntervals(baseStart, baseEnd, cuts) {
  const s0 = Number(baseStart);
  const e0 = Number(baseEnd);
  if (!Number.isFinite(s0) || !Number.isFinite(e0) || e0 <= s0) return [];

  const merged = mergeIntervals(cuts)
    .map(([s, e]) => [Math.max(s0, s), Math.min(e0, e)])
    .filter(([s, e]) => e > s);

  const segs = [];
  let cur = s0;
  for (const [s, e] of merged) {
    if (s > cur) segs.push([cur, s]);
    cur = Math.max(cur, e);
    if (cur >= e0) break;
  }
  if (cur < e0) segs.push([cur, e0]);

  // Keep only 30-min aligned segments (grid uses 30-minute slots).
  return segs.filter(([s, e]) => (e - s) >= 30 && s % 30 === 0 && e % 30 === 0);
}

function scheduleCutsByDay(entries) {
  const map = new Map(); // day -> [ [s,e], ... ]
  (entries || []).forEach((e) => {
    const day = String(e.day || "").trim();
    const sm = toMin(e.start);
    const em = toMin(e.end);
    if (!day || sm == null || em == null || em <= sm) return;
    if (!map.has(day)) map.set(day, []);
    map.get(day).push([sm, em]);
  });
  // Merge per day to keep subtraction fast.
  for (const [day, list] of map.entries()) {
    map.set(day, mergeIntervals(list));
  }
  return map;
}

function markConflicts(entries) {
  const enriched = (entries || [])
    .map((e, idx) => ({
      idx,
      day: String(e.day || "").trim(),
      room: String(e.room || "").trim(),
      teacher: String(e.teacherLabel || "").trim(),
      section: String(e.section || "").trim(),
      code: String(e.code || "").trim(),
      start: String(e.start || "").trim(),
      end: String(e.end || "").trim(),
      sm: toMin(e.start),
      em: toMin(e.end),
    }))
    .filter((e) => e.day && e.sm != null && e.em != null && e.em > e.sm);

  const conflictIdx = new Set();
  const remarks = new Map(); // idx -> Set<string>

  function addRemark(idx, msg) {
    if (!remarks.has(idx)) remarks.set(idx, new Set());
    remarks.get(idx).add(msg);
  }

  function labelOf(e) {
    const parts = [];
    if (e.section) parts.push(e.section);
    if (e.code) parts.push(e.code);
    return parts.join(" ").trim() || "Schedule";
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

            if (kind === "ROOM") {
              addRemark(a.idx, `Room conflict (${a.day} ${a.room}): overlaps ${labelOf(b)} ${b.start}-${b.end} (Teacher: ${b.teacher || "\u2014"})`);
              addRemark(b.idx, `Room conflict (${b.day} ${b.room}): overlaps ${labelOf(a)} ${a.start}-${a.end} (Teacher: ${a.teacher || "\u2014"})`);
            } else if (kind === "TEACHER") {
              addRemark(a.idx, `Teacher conflict (${a.day} ${a.teacher}): overlaps ${labelOf(b)} ${b.start}-${b.end} (Room: ${b.room || "\u2014"})`);
              addRemark(b.idx, `Teacher conflict (${b.day} ${b.teacher}): overlaps ${labelOf(a)} ${a.start}-${a.end} (Room: ${a.room || "\u2014"})`);
            }
          }
        }
      }
    });
  }

  sweep("ROOM", (e) => (e.room ? `${e.day}|ROOM|${e.room}` : null));
  sweep("TEACHER", (e) => (e.teacher ? `${e.day}|TEACHER|${e.teacher}` : null));

  return (entries || []).map((e, idx) => ({
    ...e,
    conflict: conflictIdx.has(idx),
    conflictRemarks: remarks.has(idx) ? [...remarks.get(idx)].join("\n") : "",
  }));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
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
  s = s.split(/\s*[-\u2013\u2014]\s*/)[0].trim();

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
  if (!t) return "\u2014";
  return `${t.department || ""} ${t.firstName || ""} ${t.lastName || ""}`
    .replace(/\s+/g, " ")
    .trim() || "\u2014";
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
    .map((t) => ({
      id: String(t.id),
      label: teacherFullName(t),
      email: String(t.email || "").trim().toLowerCase(),
    }));

  const labelByEmail = new Map(teachers.filter((t) => t.email).map((t) => [t.email, t.label]));
  const teacherIdByLabel = new Map(teachers.map((t) => [t.label, t.id]));

  const teacherById = new Map((teachersRaw || []).map((t) => [String(t.id), t]));
  const roomById = new Map((roomsRaw || []).map((r) => [String(r.id), r.code]));

  const entries = [];

  (blocksRaw || []).forEach((block) => {
    const section = blockSectionLabel(block);

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

        code: row.subjectCode || "\u2014",
        name: row.subjectName || "\u2014",
        section: section || "\u2014",
        room: row.roomId ? (roomById.get(String(row.roomId)) || "\u2014") : "\u2014",
      });
    });
  });

  return {
    teachers: teachers.map((t) => t.label).sort((a, b) => a.localeCompare(b)),
    entries: markConflicts(entries),
    labelByEmail,
    teacherIdByLabel,
  };
}

/* =============================================================================================
   INIT
============================================================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const title = document.getElementById("teacherTitle");
  document.getElementById("printBtn")?.addEventListener("click", () => window.print());

  renderSchedule("teacherGrid", [], () => "");

  let teachers = [];
  let entries = [];
  let labelByEmail = new Map();
  let teacherIdByLabel = new Map();

  try {
    const data = await loadTeacherScheduleData();
    teachers = data.teachers;
    entries = data.entries;
    labelByEmail = data.labelByEmail || new Map();
    teacherIdByLabel = data.teacherIdByLabel || new Map();
  } catch (err) {
    console.error("Failed loading teacher schedule", err);
  }

  let defaultTeacherLabel = null;
  if (token) {
    try {
      const me = await authFetchJson(API.me);
      const email = String(me?.email || "").trim().toLowerCase();
      if (email) defaultTeacherLabel = labelByEmail.get(email) || null;
    } catch {
      // ignore
    }
  }

  createSearchDropdown({
    inputId: "teacherSearch",
    dropdownId: "teacherDropdown",
    clearBtnId: "clearTeacherSearch",
    data: teachers,

    onSelect: async (teacherLabel) => {
      const teacherEntries = entries.filter((e) => e.teacherLabel === teacherLabel);
      const teacherId = teacherIdByLabel.get(teacherLabel) || null;

      let blockEntries = [];
      if (teacherId) {
        try {
          const blocks = (await authFetchJson(`${API.teacherBlocks}?teacherId=${encodeURIComponent(teacherId)}`)) || [];
          const cuts = scheduleCutsByDay(teacherEntries);

          const rawBlockEntries = (blocks || []).map((b) => {
            const day = toUiDay(b.dayOfWeek);
            const start = toHHMM(b.timeStart);
            const end = toHHMM(b.timeEnd);
            if (!day || !start || !end) return null;
            if (!isGridAligned(start, end)) return null;
            const kind = String(b.type || "").trim().toUpperCase();
            const typeClass = (kind === "BREAK") ? "break" : (kind === "REST_DAY") ? "restday" : "admin";
            return {
              day,
              start,
              end,
              // base.css defines .admin/.break/.restday
              type: typeClass,
              kind: "BLOCK",
              blockKind: kind,
              teacherLabel,
              label: (kind === "ADMIN") ? "ADMIN TIME" : (kind === "BREAK") ? "BREAK" : "REST DAY",
            };
          }).filter(Boolean);

          // Blocks must not overwrite class schedules in the grid.
          // For ADMIN/BREAK, subtract class schedule intervals so the remaining parts render around classes.
          blockEntries = [];
          rawBlockEntries.forEach((b) => {
            const bk = String(b.blockKind || "").toUpperCase();
            if (bk === "REST_DAY") {
              blockEntries.push(b);
              return;
            }
            const sm = toMin(b.start);
            const em = toMin(b.end);
            if (sm == null || em == null) return;

            const dayCuts = cuts.get(b.day) || [];
            const segs = dayCuts.length ? subtractIntervals(sm, em, dayCuts) : [[sm, em]];
            segs.forEach(([s, e]) => {
              blockEntries.push({ ...b, start: minToHHMM(s), end: minToHHMM(e) });
            });
          });
        } catch (e) {
          console.warn("Failed to load teacher blocks", e);
        }
      }

      // Render blocks first, then schedules (schedules should be visually dominant).
      const combined = [...blockEntries, ...teacherEntries];

      if (title) title.textContent = `Weekly Teacher Schedule - ${teacherLabel}`;

      renderSchedule("teacherGrid", combined, (e) => {
        if (e.kind === "BLOCK") {
          return `<strong>${e.label}</strong>`;
        }
        return `
          <strong>${e.code}</strong><br>
          ${e.name}<br>
          <strong>${e.section}</strong><br>
          ${e.room}<br>
        `;
      });
    },

    onClear: () => {
      if (title) title.textContent = "Weekly Teacher Schedule";
      renderSchedule("teacherGrid", [], () => "");
    },
  });

  if (defaultTeacherLabel) {
    const input = document.getElementById("teacherSearch");
    const clearBtn = document.getElementById("clearTeacherSearch");
    if (input) input.value = defaultTeacherLabel;
    if (clearBtn) clearBtn.style.display = "block";

    const teacherEntries = entries.filter((e) => e.teacherLabel === defaultTeacherLabel);
    const teacherId = teacherIdByLabel.get(defaultTeacherLabel) || null;

    let blockEntries = [];
    if (teacherId) {
      try {
        const blocks = (await authFetchJson(`${API.teacherBlocks}?teacherId=${encodeURIComponent(teacherId)}`)) || [];
        const cuts = scheduleCutsByDay(teacherEntries);

        const rawBlockEntries = (blocks || []).map((b) => {
          const day = toUiDay(b.dayOfWeek);
          const start = toHHMM(b.timeStart);
          const end = toHHMM(b.timeEnd);
          if (!day || !start || !end) return null;
          if (!isGridAligned(start, end)) return null;
          const kind = String(b.type || "").trim().toUpperCase();
          const typeClass = (kind === "BREAK") ? "break" : (kind === "REST_DAY") ? "restday" : "admin";
          return {
            day,
            start,
            end,
            type: typeClass,
            kind: "BLOCK",
            blockKind: kind,
            teacherLabel: defaultTeacherLabel,
            label: (kind === "ADMIN") ? "ADMIN TIME" : (kind === "BREAK") ? "BREAK" : "REST DAY",
          };
        }).filter(Boolean);

        blockEntries = [];
        rawBlockEntries.forEach((b) => {
          const bk = String(b.blockKind || "").toUpperCase();
          if (bk === "REST_DAY") {
            blockEntries.push(b);
            return;
          }
          const sm = toMin(b.start);
          const em = toMin(b.end);
          if (sm == null || em == null) return;

          const dayCuts = cuts.get(b.day) || [];
          const segs = dayCuts.length ? subtractIntervals(sm, em, dayCuts) : [[sm, em]];
          segs.forEach(([s, e]) => {
            blockEntries.push({ ...b, start: minToHHMM(s), end: minToHHMM(e) });
          });
        });
      } catch (_) {
        // ignore
      }
    }

    const combined = [...blockEntries, ...teacherEntries];
    if (title) title.textContent = `Weekly Teacher Schedule - ${defaultTeacherLabel}`;
    renderSchedule("teacherGrid", combined, (e) => {
      if (e.kind === "BLOCK") return `<strong>${e.label}</strong>`;
      return `
        <strong>${e.code}</strong><br>
        ${e.name}<br>
        <strong>${e.section}</strong><br>
        ${e.room}<br>
      `;
    });
  }
});
