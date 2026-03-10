/* =============================================================================================
   ROOM MODULE (Backend-connected, ALL DEPARTMENTS)
   - Rooms:      GET /api/settings/rooms
   - Teachers:   GET /api/settings/teachers
   - Schedules:  GET /api/scheduler/{jhs|shs|tertiary|namei}/blocks

   Weekly view:
   - Pick a single room and render a weekly grid (MON-SAT)

   Daily view:
   - Dashboard-style room overview (rooms as columns, time as rows)
   - User can choose the day
============================================================================================= */

import { createSearchDropdown } from "./base.js";
import { renderSchedule } from "./ScheduleGridEngine.js";

const token = localStorage.getItem("token");

const API = {
  rooms: "/api/settings/rooms",
  teachers: "/api/settings/teachers",
  me: "/api/auth/me",
  checkerReport: "/api/checker/reports",
  blocks: [
    "/api/scheduler/jhs/blocks",
    "/api/scheduler/shs/blocks",
    "/api/scheduler/tertiary/blocks",
    "/api/scheduler/namei/blocks",
  ],
};

const DAY_LABEL = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
};

function blockSectionLabel(block) {
  // Tertiary/SHS/NAMEI: sectionCode; JHS: section
  return String(block?.sectionCode || block?.section || "").trim();
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

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[m]);
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

function todayUiDayShort() {
  const d = new Date();
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const k = map[d.getDay()] || "SUN";
  // App schedules are Mon-Sat; treat Sunday as "no check day".
  return (k === "SUN") ? null : k;
}

function toHHMM(value) {
  if (!value) return "";
  let s = String(value).trim();

  // "7:00 AM - 9:00 AM" -> take first
  s = s.split(/\s*[-\u2013\u2014]\s*/)[0].trim();

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

function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
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

function fmt(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${String(m).padStart(2, "0")} ${ap}`;
}

function buildSlotMins(startMin = 7 * 60, endMin = 21 * 60, step = 30) {
  const out = [];
  for (let t = startMin; t < endMin; t += step) out.push(t);
  return out;
}

function isGridAligned(startHHMM, endHHMM) {
  if (!startHHMM || !endHHMM) return false;

  const sm = startHHMM.split(":").map(Number);
  const em = endHHMM.split(":").map(Number);
  if (sm.length < 2 || em.length < 2) return false;
  if (sm.some((n) => !Number.isFinite(n)) || em.some((n) => !Number.isFinite(n))) return false;

  const startMin = sm[0] * 60 + sm[1];
  const endMin = em[0] * 60 + em[1];

  // Engine grid is 07:00-21:00, 30-min slots
  if (startMin < 7 * 60 || endMin > 21 * 60) return false;
  if (startMin % 30 !== 0 || endMin % 30 !== 0) return false;
  if ((endMin - startMin) <= 0 || (endMin - startMin) % 30 !== 0) return false;

  return true;
}

function teacherFullName(t) {
  if (!t) return "\u2014";
  const dept = (t.department || "").trim();
  const fn = (t.firstName || "").trim();
  const ln = (t.lastName || "").trim();
  return `${dept} ${fn} ${ln}`.replace(/\s+/g, " ").trim() || "\u2014";
}

function normalizeRole(roleRaw) {
  const r = String(roleRaw || "").trim().toUpperCase().replace(/\s+/g, "_").replace(/-/g, "_");
  if (r === "SUPERADMIN") return "SUPER_ADMIN";
  if (r === "NONTEACHING") return "NON_TEACHING";
  return r || "TEACHER";
}

async function loadRoomScheduleData() {
  const [roomsRaw, teachersRaw, blocksRaw] = await Promise.all([
    fetchJson(API.rooms).catch(() => []),
    fetchJson(API.teachers).catch(() => []),
    fetchAllBlocks(API.blocks).catch(() => []),
  ]);

  const rooms = (roomsRaw || [])
    .filter((r) => String(r.status || "Active").toLowerCase() === "active")
    .map((r) => ({ id: String(r.id), code: String(r.code || "").trim() }))
    .filter((r) => r.id && r.code)
    .sort((a, b) => a.code.localeCompare(b.code));

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
    const section = blockSectionLabel(block);

    (block.rows || []).forEach((row) => {
      const day = toUiDay(row.dayOfWeek);
      const start = toHHMM(row.timeStart);
      const end = toHHMM(row.timeEnd);
      if (!day || !start || !end) return;
      if (!isGridAligned(start, end)) return;

      const roomCode = row.roomId ? roomCodeById.get(String(row.roomId)) : null;
      if (!roomCode) return;

      const teacherId = row.teacherId ? String(row.teacherId) : null;
      const scheduleId = row.id ? String(row.id) : null;
      const teacher = teacherId ? teacherById.get(teacherId) : null;

      entries.push({
        // required by ScheduleGridEngine
        day,
        start,
        end,
        type: row.isElective ? "Elective" : "Regular",

        // filter key
        room: roomCode,

        // cell content
        code: row.subjectCode || "\u2014",
        name: row.subjectName || "\u2014",
        section: section || "\u2014",
        teacherLabel: teacherFullName(teacher),

        // for checker reports
        scheduleId,
        teacherId,
      });
    });
  });

  return {
    rooms: rooms.map((r) => r.code),
    entries: markConflicts(entries),
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  const title = document.getElementById("roomTitle");
  const weeklyView = document.getElementById("weeklyView");
  const dailyView = document.getElementById("dailyView");

  function isDailyActive() {
    return !!dailyView && !dailyView.classList.contains("is-hidden");
  }

  function buildDailyPrintArea({ headerRow, bodyRows, dayLabel }) {
    const existing = document.getElementById("dailyRoomPrintArea");
    existing?.remove();

    const wrap = document.createElement("div");
    wrap.id = "dailyRoomPrintArea";
    // Hidden on screen; print CSS will reveal it when data-print-mode is set.
    wrap.style.display = "none";

    // Clone current table state into a column-paginated print layout.
    const headerCells = [...(headerRow?.children || [])];
    if (headerCells.length < 2) return wrap;

    // First header cell is TIME (colspan=2). The rest are room columns.
    const roomLabels = headerCells
      .slice(1)
      .map((th) => (th?.innerText || th?.textContent || "").trim())
      .filter(Boolean);

    // Decide how many room columns per page (approx. for A4 landscape).
    const pageWidth = 1080;
    const timeWidth = 160;
    const roomWidth = 125;
    const roomsPerPage = Math.max(1, Math.floor((pageWidth - timeWidth) / roomWidth));

    function makeTableChunk(roomStartIdx, roomEndIdx) {
      const table = document.createElement("table");
      table.className = "schedule-table";

      const thead = document.createElement("thead");
      const tr = document.createElement("tr");

      const thTime = document.createElement("th");
      thTime.colSpan = 2;
      thTime.textContent = "TIME";
      tr.appendChild(thTime);

      for (let i = roomStartIdx; i < roomEndIdx; i++) {
        const th = document.createElement("th");
        th.textContent = roomLabels[i] || "";
        tr.appendChild(th);
      }

      thead.appendChild(tr);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      const rows = [...(bodyRows || [])];

      rows.forEach((r) => {
        const cells = [...(r.children || [])];
        if (cells.length < 2) return;

        const outTr = document.createElement("tr");

        // Copy first 2 TIME tds (start/end)
        outTr.appendChild(cells[0].cloneNode(true));
        outTr.appendChild(cells[1].cloneNode(true));

        // Room columns start at index 2
        for (let i = roomStartIdx; i < roomEndIdx; i++) {
          const srcIdx = 2 + i;
          const td = (cells[srcIdx] ? cells[srcIdx].cloneNode(true) : document.createElement("td"));
          outTr.appendChild(td);
        }

        tbody.appendChild(outTr);
      });

      table.appendChild(tbody);
      return table;
    }

    const pages = [];
    for (let i = 0; i < roomLabels.length; i += roomsPerPage) {
      pages.push({ start: i, end: Math.min(roomLabels.length, i + roomsPerPage) });
    }

    pages.forEach((p, idx) => {
      const page = document.createElement("div");
      page.className = "print-page";

      const h = document.createElement("div");
      h.style.fontWeight = "900";
      h.style.margin = "0 0 8px";
      h.textContent = `Daily Room Overview${dayLabel ? ` - ${dayLabel}` : ""} (Page ${idx + 1} of ${pages.length})`;
      page.appendChild(h);

      const grid = document.createElement("div");
      grid.className = "schedule-grid";
      grid.appendChild(makeTableChunk(p.start, p.end));
      page.appendChild(grid);

      wrap.appendChild(page);
    });

    return wrap;
  }

  async function printRoomSchedule() {
    if (!isDailyActive()) {
      window.print();
      return;
    }

    const headerRow = document.getElementById("dailyRoomOverviewHeader");
    const bodyTbody = document.getElementById("dailyRoomGrid");
    const daySel = document.getElementById("dailyDaySelect");
    const dayKey = String(daySel?.value || "").trim().toUpperCase();
    const dayLabel = DAY_LABEL[dayKey] || dayKey;

    const area = buildDailyPrintArea({
      headerRow,
      bodyRows: bodyTbody?.children || [],
      dayLabel,
    });

    document.body.appendChild(area);
    document.body.setAttribute("data-print-mode", "daily-room");

    // Print, then clean up after printing completes.
    const cleanup = () => {
      document.body.removeAttribute("data-print-mode");
      document.getElementById("dailyRoomPrintArea")?.remove();
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    window.print();
  }

  document.getElementById("printBtn")?.addEventListener("click", printRoomSchedule);

  document.getElementById("downloadDailyExcelBtn")?.addEventListener("click", () => {
    if (!isDailyActive()) {
      appAlert("Switch to Daily View to download the daily room schedule.");
      return;
    }
    if (typeof window.downloadTableAsCsv !== "function") {
      appAlert("Download is not available right now.");
      return;
    }

    const daySel = document.getElementById("dailyDaySelect");
    const dayKey = String(daySel?.value || "").trim().toUpperCase();
    const dayLabel = DAY_LABEL[dayKey] || dayKey || "DAY";
    window.downloadTableAsCsv("dailyRoomOverviewTable", `RoomSchedule_${dayLabel}`);
  });

  // Checker presence modal controls (only active when role=CHECKER).
  const checkerModal = document.getElementById("checkerModal");
  const checkerInfo = document.getElementById("checkerInfo");
  const checkerScheduleId = document.getElementById("checkerScheduleId");
  const checkerStatus = document.getElementById("checkerStatus");
  const checkerNote = document.getElementById("checkerNote");
  const checkerSaveBtn = document.getElementById("checkerSaveBtn");
  const checkerCancelBtn = document.getElementById("checkerCancelBtn");

  const weeklyBtn = document.getElementById("weeklyViewBtn");
  const dailyBtn = document.getElementById("dailyViewBtn");
  const weeklyTools = document.getElementById("weeklyTools");
  const dailyTools = document.getElementById("dailyTools");

  const dailyDaySelect = document.getElementById("dailyDaySelect");
  const dailyTitle = document.getElementById("dailyRoomTitle");
  const dailyHeaderRow = document.getElementById("dailyRoomOverviewHeader");
  const dailyTbody = document.getElementById("dailyRoomGrid");

  renderSchedule("roomGrid", [], () => "");

  let rooms = [];
  let entries = [];
  let entryByScheduleId = new Map();
  let isChecker = false;

  try {
    // Determine role for checker-specific behavior
    try {
      const me = await fetchJson(API.me);
      isChecker = normalizeRole(me?.role) === "CHECKER";
    } catch {
      isChecker = false;
    }

    const data = await loadRoomScheduleData();
    rooms = data.rooms;
    entries = data.entries;
    entryByScheduleId = new Map((entries || []).filter((e) => e.scheduleId).map((e) => [String(e.scheduleId), e]));
  } catch (err) {
    console.error("Failed to load room schedule data", err);
  }

  function openCheckerModal(scheduleId) {
    if (!checkerModal || !checkerScheduleId || !checkerInfo) return;
    const e = entryByScheduleId.get(String(scheduleId)) || null;
    if (!e || !e.scheduleId) return;

    // Checker can only check current-day schedules.
    const today = todayUiDayShort();
    if (!today || String(e.day || "").trim() !== today) {
      const todayLabel = today ? (DAY_LABEL[today] || today) : "today";
      if (typeof appAlert === "function") appAlert(`Checker can only check schedules for ${todayLabel}.`);
      return;
    }

    if (!e.teacherId) {
      if (typeof appAlert === "function") appAlert("This schedule has no teacher assigned.");
      return;
    }

    checkerScheduleId.value = String(e.scheduleId);
    if (checkerStatus) checkerStatus.value = "PRESENT";
    if (checkerNote) checkerNote.value = "";

    const info = [
      `Room: ${e.room || "\u2014"}`,
      `Day/Time: ${e.day || "\u2014"} ${e.start || "\u2014"}-${e.end || "\u2014"}`,
      `Teacher: ${e.teacherLabel || "\u2014"}`,
      `Section: ${e.section || "\u2014"}`,
      `Subject: ${(e.code || "\u2014")} ${(e.name || "\u2014")}`.trim(),
    ].join("\n");

    checkerInfo.textContent = info;
    checkerModal.classList.remove("hidden");
  }

  function closeCheckerModal() {
    checkerModal?.classList.add("hidden");
  }

  async function submitCheckerReport() {
    const sid = String(checkerScheduleId?.value || "").trim();
    if (!sid) return;

    try {
      const status = String(checkerStatus?.value || "").trim() || "PRESENT";
      const res = await fetch(API.checkerReport, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          scheduleId: sid,
          status,
          note: String(checkerNote?.value || "").trim() || null,
        }),
      });

      const txt = await res.text();
      if (!res.ok) {
        let msg = `${res.status} ${res.statusText}`;
        try { if (txt) msg = JSON.parse(txt)?.message || msg; } catch { if (txt) msg = txt; }
        throw new Error(msg);
      }

      closeCheckerModal();
      appAlert("Report submitted.");
    } catch (e) {
      console.error(e);
      appAlert(e?.message || "Failed to submit report.");
    }
  }

  checkerSaveBtn?.addEventListener("click", submitCheckerReport);
  checkerCancelBtn?.addEventListener("click", closeCheckerModal);
  checkerModal?.addEventListener("click", (e) => {
    if (e.target === checkerModal) closeCheckerModal();
  });

  function show(which) {
    const isWeekly = which === "weekly";

    if (weeklyView) weeklyView.classList.toggle("is-hidden", !isWeekly);
    if (dailyView) dailyView.classList.toggle("is-hidden", isWeekly);
    if (weeklyTools) weeklyTools.classList.toggle("is-hidden", !isWeekly);
    if (dailyTools) dailyTools.classList.toggle("is-hidden", isWeekly);

    if (weeklyBtn) {
      weeklyBtn.classList.toggle("btn-primary", isWeekly);
      weeklyBtn.classList.toggle("btn-secondary", !isWeekly);
    }

    if (dailyBtn) {
      dailyBtn.classList.toggle("btn-primary", !isWeekly);
      dailyBtn.classList.toggle("btn-secondary", isWeekly);
    }
  }

  if (weeklyBtn) weeklyBtn.addEventListener("click", () => show("weekly"));
  if (dailyBtn) dailyBtn.addEventListener("click", () => show("daily"));

  // WEEKLY VIEW (pick room)
  createSearchDropdown({
    inputId: "roomSearch",
    dropdownId: "roomDropdown",
    clearBtnId: "clearRoomSearch",
    data: rooms,

    onSelect: (room) => {
      const roomEntries = entries.filter((e) => e.room === room);
      if (title) title.textContent = `Weekly Room Schedule - ${room}`;

      renderSchedule("roomGrid", roomEntries, (e) => `
        <div ${isChecker && e.scheduleId ? `data-schedule-id="${escapeHtml(e.scheduleId)}" style="cursor:pointer;"` : ""}>
          <strong>${escapeHtml(e.code)}</strong><br>
          ${escapeHtml(e.name)}<br>
          <strong>${escapeHtml(e.section)}</strong><br>
          ${escapeHtml(e.teacherLabel)}<br>
        </div>
      `);
    },

    onClear: () => {
      if (title) title.textContent = "Weekly Room Schedule";
      renderSchedule("roomGrid", [], () => "");
    },
  });

  // DAILY VIEW (dashboard-style room overview)
  const slotMins = buildSlotMins(7 * 60, 21 * 60, 30);
  let selectedDay = "MON";
  let selectedRoom = null;

  if (dailyDaySelect) {
    const jsDay = new Date().getDay(); // 0..6 (Sun..Sat)
    const map = { 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI", 6: "SAT" };
    selectedDay = map[jsDay] || "MON";
    dailyDaySelect.value = selectedDay;

    dailyDaySelect.addEventListener("change", () => {
      selectedDay = String(dailyDaySelect.value || "MON").toUpperCase();
      renderDailyGrid();
    });
  }

  function renderDailyGrid() {
    if (!dailyHeaderRow || !dailyTbody) return;

    const label = DAY_LABEL[selectedDay] || selectedDay;
    if (dailyTitle) {
      dailyTitle.textContent = selectedRoom
        ? `Daily Room Overview (${label}) - ${selectedRoom}`
        : `Daily Room Overview (${label})`;
    }

    const cols = selectedRoom ? [selectedRoom] : rooms.slice();

    dailyHeaderRow.innerHTML =
      `<th colspan="2">TIME</th>` + cols.map((r) => `<th>${escapeHtml(r)}</th>`).join("");

    dailyTbody.innerHTML = "";

    const dayEntries = entries.filter((e) => e.day === selectedDay && cols.includes(e.room));

    // grid[startMin][room] = null | "skip" | { rowspan, html, type }
    const grid = new Map();
    slotMins.forEach((t) => {
      const row = new Map();
      cols.forEach((r) => row.set(r, null));
      grid.set(t, row);
    });

    dayEntries.forEach((e) => {
      const sm = toMin(e.start);
      const em = toMin(e.end);
      if (sm == null || em == null) return;
      if (sm < 7 * 60 || em > 21 * 60) return;
      if (sm % 30 !== 0 || em % 30 !== 0) return;
      if (em <= sm) return;

      const span = (em - sm) / 30;
      const row = grid.get(sm);
      if (!row) return;

      row.set(e.room, {
        rowspan: span,
        type: e.type,
        conflict: !!e.conflict,
        conflictRemarks: e.conflictRemarks || "",
        scheduleId: e.scheduleId || null,
        html: `
          <div ${isChecker && e.scheduleId ? `data-schedule-id="${escapeHtml(e.scheduleId)}" style="cursor:pointer;"` : ""}>
            <strong>${escapeHtml(e.code || "\u2014")}</strong><br>
            ${escapeHtml(e.section || "\u2014")}<br>
            <span class="muted">${escapeHtml(e.teacherLabel || "\u2014")}</span>
          </div>
        `,
      });

      for (let i = 1; i < span; i++) {
        const next = grid.get(sm + i * 30);
        if (!next) continue;
        next.set(e.room, "skip");
      }
    });

    slotMins.forEach((t) => {
      const tr = document.createElement("tr");

      const tdStart = document.createElement("td");
      tdStart.className = "time-col";
      tdStart.textContent = fmt(t);
      tr.appendChild(tdStart);

      const tdEnd = document.createElement("td");
      tdEnd.className = "time-col";
      tdEnd.textContent = fmt(t + 30);
      tr.appendChild(tdEnd);

      const row = grid.get(t);
      cols.forEach((room) => {
        const cellData = row && row.get(room);
        if (cellData === "skip") return;

        const td = document.createElement("td");
        if (cellData && cellData.rowspan) {
          td.rowSpan = cellData.rowspan;
          td.innerHTML = cellData.html;
          td.className = cellData.type || "";
          if (cellData.conflict) td.classList.add("conflict-cell");
          if (cellData.conflictRemarks) td.title = String(cellData.conflictRemarks);
          if (isChecker && cellData.scheduleId) td.dataset.scheduleId = String(cellData.scheduleId);
        }
        tr.appendChild(td);
      });

      dailyTbody.appendChild(tr);
    });
  }

  createSearchDropdown({
    inputId: "dailyRoomSearch",
    dropdownId: "dailyRoomDropdown",
    clearBtnId: "clearDailyRoomSearch",
    data: rooms,

    onSelect: (room) => {
      selectedRoom = room;
      renderDailyGrid();
    },

    onClear: () => {
      selectedRoom = null;
      renderDailyGrid();
    },
  });

  renderDailyGrid();
  show("weekly");

  // Checker: click any schedule cell in weekly/daily view to open report prompt.
  const weeklyTbody = document.getElementById("roomGrid");
  weeklyTbody?.addEventListener("click", (ev) => {
    if (!isChecker) return;
    const hit = ev.target.closest("[data-schedule-id]");
    const sid = hit?.getAttribute?.("data-schedule-id");
    if (sid) openCheckerModal(sid);
  });

  dailyTbody?.addEventListener("click", (ev) => {
    if (!isChecker) return;
    const td = ev.target.closest("td");
    const sid = td?.dataset?.scheduleId || ev.target.closest("[data-schedule-id]")?.getAttribute?.("data-schedule-id");
    if (sid) openCheckerModal(sid);
  });
});
