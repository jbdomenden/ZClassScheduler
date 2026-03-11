// Dashboard.js (module)
// Room Overview uses the same time-slot table grid feel as SchedulesRoom,
// but with rooms as the column headers.

const token = localStorage.getItem("token");
const UTIL_DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
let utilMode = "day"; // "day" | "week"

async function authFetchJson(url) {
  if (!token) throw new Error("Missing token");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const txt = await res.text();
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try { if (txt) msg = (JSON.parse(txt)?.message || msg); } catch { if (txt) msg = txt; }
    throw new Error(msg);
  }

  if (!txt) return null;
  return ct.includes("application/json") ? JSON.parse(txt) : txt;
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

function setText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value == null ? "-" : String(value);
}

function toMin(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  return h * 60 + mm;
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

async function loadSummary() {
  const s = await authFetchJson("/dashboard/summary");
  setText("kpiActiveSchedules", s?.activeSchedules);
  setText("kpiActiveTeachers", s?.activeTeachers);
  setText("kpiActiveRooms", s?.activeRooms);
  setText("kpiSchedulesToday", s?.totalSchedulesToday);
}

async function loadRoomOverview() {
  const headerRow = document.getElementById("roomOverviewHeader") || document.querySelector("#roomOverviewTable thead tr");
  const tbody = document.getElementById("roomGrid") || document.querySelector("#roomOverviewTable tbody");
  const title = document.getElementById("roomTitle");
  if (!headerRow || !tbody) return;

  const slotMins = buildSlotMins(7 * 60, 21 * 60, 30);

  const [roomsRaw, dataRaw] = await Promise.all([
    authFetchJson("/api/settings/rooms").catch(() => []),
    authFetchJson("/dashboard/rooms").catch(() => []),
  ]);

  const allRooms = (roomsRaw || [])
    .filter((r) => (String(r.status || "Active").toLowerCase() === "active"))
    .map((r) => String(r.code || "").trim())
    .filter(Boolean)
    .sort(floorNumericSort);

  const data = (dataRaw || []).map((s) => ({
    roomCode: String(s.roomCode || "").trim(),
    startTime: String(s.startTime || "").trim(),
    endTime: String(s.endTime || "").trim(),
    subject: String(s.subject || "").trim(),
    section: String(s.section || "").trim(),
    teacher: String(s.teacher || "\u2014").trim(),
  }));

  const fallbackRooms = [...new Set(data.map((d) => d.roomCode).filter(Boolean))].sort(floorNumericSort);
  const rooms = allRooms.length ? allRooms : fallbackRooms;

  function render(roomsToShow) {
    const cols = (roomsToShow || []).filter(Boolean);

    headerRow.innerHTML =
      `<th colspan="2">TIME</th>` +
      cols.map((r) => `<th>${escapeHtml(r)}</th>`).join("");

    tbody.innerHTML = "";

    // grid[startMin][room] = null | "skip" | { rowspan, html }
    const grid = new Map();
    slotMins.forEach((t) => {
      const row = new Map();
      cols.forEach((r) => row.set(r, null));
      grid.set(t, row);
    });

    data.forEach((s) => {
      if (!cols.includes(s.roomCode)) return;
      const sm = toMin(s.startTime);
      const em = toMin(s.endTime);
      if (sm == null || em == null) return;
      if (sm < 7 * 60 || em > 21 * 60) return;
      if (sm % 30 !== 0 || em % 30 !== 0) return;
      if (em <= sm) return;

      const span = (em - sm) / 30;
      const row = grid.get(sm);
      if (!row) return;

      row.set(s.roomCode, {
        rowspan: span,
        html: `
          <strong>${escapeHtml(s.subject || "\u2014")}</strong><br>
          ${escapeHtml(s.section || "\u2014")}<br>
          <span class="muted">${escapeHtml(s.teacher || "\u2014")}</span>
        `,
      });

      for (let i = 1; i < span; i++) {
        const next = grid.get(sm + i * 30);
        if (!next) continue;
        next.set(s.roomCode, "skip");
      }
    });

    slotMins.forEach((t) => {
      const tr = document.createElement("tr");

      const tdStart = document.createElement("td");
      tdStart.className = "time-col time-col-start";
      tdStart.textContent = fmt(t);
      tr.appendChild(tdStart);

      const tdEnd = document.createElement("td");
      tdEnd.className = "time-col time-col-end";
      tdEnd.textContent = fmt(t + 30);
      tr.appendChild(tdEnd);

      const row = grid.get(t);
      cols.forEach((room) => {
        const cellData = row?.get(room);
        if (cellData === "skip") return;

        const td = document.createElement("td");
        if (cellData && cellData.rowspan) {
          td.rowSpan = cellData.rowspan;
          td.innerHTML = cellData.html;
          td.classList.add("occupied");
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  if (title) title.textContent = "Today's Room Overview";
  render(rooms);
}


function normalizeRoomTypeLabel(v) {
  const x = String(v || "").trim().toUpperCase();
  if (x === "LAB" || x === "LABORATORY") return "Laboratory";
  if (x === "LECTURE") return "Lecture";
  if (x === "MULTIPURPOSE") return "Multipurpose";
  return String(v || "").trim();
}

function floorNumericSort(a, b) {
  const parse = (v) => {
    const s = String(v || "").trim().toLowerCase();
    if (!s) return Number.POSITIVE_INFINITY;
    if (s === "g" || s === "gf" || s.includes("ground")) return 0;
    const m = s.match(/-?\d+/);
    return m ? Number.parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
  };
  const pa = parse(a); const pb = parse(b);
  if (pa !== pb) return pa - pb;
  return String(a || "").localeCompare(String(b || ""));
}

function utilColorClass(percent) {
  if (percent >= 80) return "high";
  if (percent >= 50) return "medium";
  return "low";
}

function todayKey() {
  const d = new Date();
  const map = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
  const k = map[d.getDay()] || "MONDAY";
  // Default to MONDAY if it's Sunday (app typically schedules Mon-Sat).
  return (k === "SUNDAY") ? "MONDAY" : k;
}

function setUtilMode(mode) {
  utilMode = (mode === "week") ? "week" : "day";

  const btnDay = document.getElementById("utilModeDay");
  const btnWeek = document.getElementById("utilModeWeek");
  const daySel = document.getElementById("utilDaySelect");

  if (btnDay && btnWeek) {
    btnDay.classList.toggle("btn-primary", utilMode === "day");
    btnDay.classList.toggle("btn-secondary", utilMode !== "day");

    btnWeek.classList.toggle("btn-primary", utilMode === "week");
    btnWeek.classList.toggle("btn-secondary", utilMode !== "week");
  }

  if (daySel) daySel.classList.toggle("is-hidden", utilMode !== "day");
}

async function loadRoomUtilization() {
  const tbody = document.getElementById("utilizationGrid");
  if (!tbody) return;

  tbody.innerHTML = "";

  const daySel = document.getElementById("utilDaySelect");
  const day = String(daySel?.value || todayKey()).trim().toUpperCase();

  const utilUrl = (utilMode === "week")
    ? "/dashboard/rooms/utilization/week-grid"
    : `/dashboard/rooms/utilization?day=${encodeURIComponent(day)}`;

  const [utilRaw, roomsRaw] = await Promise.all([
    authFetchJson(utilUrl).catch(() => []),
    authFetchJson("/api/settings/rooms").catch(() => []),
  ]);

  const table = tbody.closest("table");
  function ensureHead(cols) {
    if (!table) return;
    let thead = table.querySelector("thead");
    if (!thead) {
      thead = document.createElement("thead");
      table.insertBefore(thead, table.firstChild);
    }
    thead.innerHTML = `<tr>${(cols || []).map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr>`;
  }

  const roomMeta = new Map(
    (roomsRaw || []).map((r) => [
      String(r.code || r.roomCode || r.name || "").trim(),
      {
        floor: String(r.floor || "").trim(),
        type: normalizeRoomTypeLabel(r.type),
      },
    ])
  );

  const floorSelect = document.getElementById("utilFloorFilter");
  const typeSelect = document.getElementById("utilTypeFilter");

  // Populate filter options once.
  if (floorSelect && floorSelect.options.length <= 1) {
    const floors = [...new Set((roomsRaw || []).map((r) => String(r.floor || "").trim()).filter(Boolean))]
      .sort(floorNumericSort);
    floors.forEach((f) => floorSelect.add(new Option(f, f)));
  }
  if (typeSelect && typeSelect.options.length <= 1) {
    const types = [...new Set((roomsRaw || []).map((r) => normalizeRoomTypeLabel(r.type)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    types.forEach((t) => typeSelect.add(new Option(t, t)));
  }

  function applyFilters(list) {
    const floor = floorSelect ? String(floorSelect.value || "").trim() : "";
    const type = typeSelect ? String(typeSelect.value || "").trim() : "";

    return (list || []).filter((r) => {
      const meta = roomMeta.get(String(r.roomName || "").trim());
      if (floor && String(meta?.floor || "") !== floor) return false;
      if (type && String(meta?.type || "") !== type) return false;
      return true;
    });
  }

  if (utilMode === "week") {
    const days = Array.isArray(utilRaw?.days) ? utilRaw.days : UTIL_DAYS.slice();
    const overallByDay = (utilRaw && typeof utilRaw === "object" && utilRaw.overallByDay) ? utilRaw.overallByDay : {};
    const overallTotal = Number(utilRaw?.overallTotal) || 0;
    const weekOverallLabel = document.getElementById("utilWeekOverall");
    if (weekOverallLabel) weekOverallLabel.textContent = `Overall: ${overallTotal.toFixed(2)}%`;

    const rows = (Array.isArray(utilRaw?.rooms) ? utilRaw.rooms : []).map((r) => ({
      roomName: String(r?.roomName || "").trim(),
      byDay: (r && typeof r === "object" && r.byDay) ? r.byDay : {},
      total: Number(r?.total) || 0,
    })).filter((r) => r.roomName);

    function renderWeek(list) {
      const filtered = applyFilters(list);
      ensureHead(["Room", ...days.map((d) => String(d).slice(0, 3)), "Total"]);
      tbody.innerHTML = "";

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td class="muted">No utilization data.</td></tr>`;
        return;
      }

      const overallRow = document.createElement("tr");
      overallRow.className = "overall-row";
      overallRow.innerHTML =
        `<td>Overall</td>` +
        days.map((d) => {
          const pct = Number(overallByDay?.[d]) || 0;
          const cls = utilColorClass(pct);
          return `<td style="white-space:nowrap;"><span class="util-pct ${cls}">${pct}%</span></td>`;
        }).join("") +
        `<td style="white-space:nowrap;"><span class="util-pct ${utilColorClass(overallTotal)}">${overallTotal}%</span></td>`;
      tbody.appendChild(overallRow);

      filtered
        .slice()
        .sort((a, b) => String(a.roomName || "").localeCompare(String(b.roomName || "")))
        .forEach((r) => {
          const tr = document.createElement("tr");

          const tds = [];
          tds.push(`<td>${escapeHtml(r.roomName)}</td>`);
          days.forEach((d) => {
            const pct = Number(r.byDay?.[d]) || 0;
            const cls = utilColorClass(pct);
            tds.push(`
              <td style="min-width:72px;white-space:nowrap;">
                <span class="util-pct ${cls}">${pct}%</span>
              </td>
            `);
          });

          const total = Number(r.total) || 0;
          const tcls = utilColorClass(total);
          tds.push(`
            <td style="min-width:88px;white-space:nowrap;">
              <span class="util-pct ${tcls}">${total}%</span>
            </td>
          `);

          tr.innerHTML = tds.join("");
          tbody.appendChild(tr);
        });
    }

    if (floorSelect && !floorSelect.dataset.bound) {
      floorSelect.dataset.bound = "1";
      floorSelect.addEventListener("change", () => renderWeek(rows));
    }
    if (typeSelect && !typeSelect.dataset.bound) {
      typeSelect.dataset.bound = "1";
      typeSelect.addEventListener("change", () => renderWeek(rows));
    }

    renderWeek(rows);
    return;
  }

  const weekOverallLabel = document.getElementById("utilWeekOverall");
  if (weekOverallLabel) weekOverallLabel.textContent = "Overall: --%";

  // Day mode: list
  const data = (utilRaw || []).map((r) => ({
    roomName: String(r.roomName || "").trim(),
    utilizationPercent: Number(r.utilizationPercent) || 0,
  }));

  function render(list) {
    ensureHead(["Room", "%"]);
    tbody.innerHTML = "";

    const filtered = applyFilters(list);
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td class="muted">No utilization data.</td></tr>`;
      return;
    }

    // Overall should disregard unused rooms (0%).
    const used = filtered.filter((r) => (Number(r.utilizationPercent) || 0) > 0);
    const avg = used.length
      ? Math.round(used.reduce((acc, r) => acc + (Number(r.utilizationPercent) || 0), 0) / used.length)
      : 0;

    const overall = document.createElement("tr");
    overall.className = "overall-row";
    overall.innerHTML = `
      <td>Overall</td>
      <td style="white-space:nowrap;"><span class="util-pct ${utilColorClass(avg)}">${avg}%</span></td>
    `;
    tbody.appendChild(overall);

    filtered
      .slice()
      .sort((a, b) => String(a.roomName || "").localeCompare(String(b.roomName || "")))
      .forEach((r) => {
        const pct = Number(r.utilizationPercent) || 0;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(r.roomName || "")}</td>
          <td style="white-space:nowrap;"><span class="util-pct ${utilColorClass(pct)}">${pct}%</span></td>
        `;
        tbody.appendChild(tr);
      });
  }

  // Bind once; re-render on changes.
  if (floorSelect && !floorSelect.dataset.bound) {
    floorSelect.dataset.bound = "1";
    floorSelect.addEventListener("change", () => render(data));
  }
  if (typeSelect && !typeSelect.dataset.bound) {
    typeSelect.dataset.bound = "1";
    typeSelect.addEventListener("change", () => render(data));
  }

  render(data);
}

function badge(value) {
  if (!value) return `<span class="badge bad">Missing</span>`;
  return `<span class="badge">${escapeHtml(value)}</span>`;
}

async function loadIncompleteSchedules() {
  const tbody = document.getElementById("incompleteGrid");
  if (!tbody) return;

  tbody.innerHTML = "";
  const data = (await authFetchJson("/dashboard/incomplete?limit=200")) || [];

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">All schedules complete.</td></tr>`;
    return;
  }

  // Group by section with expandable details (grouped by subject).
  const sections = new Map();
  data.forEach((s) => {
    const section = String(s.section || "").trim() || "\u2014";
    if (!sections.has(section)) {
      sections.set(section, {
        section,
        items: [],
        rows: 0,
        missingDay: 0,
        missingTime: 0,
        missingTeacher: 0,
        missingRoom: 0,
      });
    }

    const g = sections.get(section);
    g.items.push({
      subject: String(s.subject || "").trim() || "\u2014",
      day: s.day ? String(s.day).trim() : "",
      time: s.time ? String(s.time).trim() : "",
      teacher: s.teacher ? String(s.teacher).trim() : "",
      room: s.room ? String(s.room).trim() : "",
    });

    g.rows += 1;
    if (!s.day) g.missingDay += 1;
    if (!s.time) g.missingTime += 1;
    if (!s.teacher) g.missingTeacher += 1;
    if (!s.room) g.missingRoom += 1;
  });

  function renderMissingBadges(row) {
    const out = [];
    if (!row.day) out.push(`<span class="badge bad">Missing Day</span>`);
    if (!row.time) out.push(`<span class="badge bad">Missing Time</span>`);
    if (!row.teacher) out.push(`<span class="badge bad">Missing Teacher</span>`);
    if (!row.room) out.push(`<span class="badge bad">Missing Room</span>`);
    return out.join(" ");
  }

  function renderDetail(sectionGroup) {
    const bySubject = new Map();
    (sectionGroup.items || []).forEach((it) => {
      const key = it.subject || "\u2014";
      if (!bySubject.has(key)) bySubject.set(key, []);
      bySubject.get(key).push(it);
    });

    const subjects = [...bySubject.keys()].sort((a, b) => String(a).localeCompare(String(b)));
    const body = subjects.map((subject) => {
      const items = (bySubject.get(subject) || []).slice().sort((a, b) => {
        const ad = String(a.day || "");
        const bd = String(b.day || "");
        if (ad !== bd) return ad.localeCompare(bd);
        return String(a.time || "").localeCompare(String(b.time || ""));
      });

      const span = Math.max(1, items.length);
      return items.map((x, idx) => `
        <tr>
          ${idx === 0 ? `<td rowspan="${span}"><strong>${escapeHtml(subject)}</strong></td>` : ``}
          <td>${escapeHtml(x.day || "\u2014")}</td>
          <td>${escapeHtml(x.time || "\u2014")}</td>
          <td>${escapeHtml(x.room || "\u2014")}</td>
          <td>${escapeHtml(x.teacher || "\u2014")}</td>
        </tr>
      `).join("");
    }).join("");

    return `
      <div class="incomplete-detail">
        <div class="detail-title">Missing details</div>
        <div class="detail-table-wrap">
          <table class="detail-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Day</th>
                <th>Time</th>
                <th>Room</th>
                <th>Teacher</th>
              </tr>
            </thead>
            <tbody>
              ${body || `<tr><td colspan="5" class="muted">No details.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  const ordered = [...sections.values()].sort((a, b) => a.section.localeCompare(b.section));
  ordered.forEach((g) => {
    const sectionId = `sec_${btoa(unescape(encodeURIComponent(g.section))).replace(/=+$/g, "")}`;

    const tr = document.createElement("tr");
    tr.className = "incomplete-section-row";
    tr.dataset.section = g.section;
    tr.dataset.detailId = sectionId;
    tr.innerHTML = `
      <td class="toggle-cell">
        <button class="expand-btn" type="button" aria-expanded="false" aria-controls="${escapeHtml(sectionId)}">+</button>
      </td>
      <td><strong>${escapeHtml(g.section)}</strong></td>
      <td>${g.rows}</td>
      <td>${g.missingDay}</td>
      <td>${g.missingTime}</td>
      <td>${g.missingTeacher}</td>
      <td>${g.missingRoom}</td>
    `;
    tbody.appendChild(tr);

    const detail = document.createElement("tr");
    detail.className = "incomplete-detail-row is-hidden";
    detail.id = sectionId;
    detail.innerHTML = `<td colspan="7">${renderDetail(g)}</td>`;
    tbody.appendChild(detail);
  });

  // One click handler for toggling.
  if (!tbody.dataset.bound) {
    tbody.dataset.bound = "1";
    tbody.addEventListener("click", (e) => {
      const row = e.target.closest("tr.incomplete-section-row");
      if (!row) return;

      const btn = row.querySelector(".expand-btn");
      if (!btn) return;

      const detailId = row.dataset.detailId;
      if (!detailId) return;

      // Close others for cleanliness.
      tbody.querySelectorAll("tr.incomplete-detail-row").forEach((r) => {
        if (r.id !== detailId) r.classList.add("is-hidden");
      });
      tbody.querySelectorAll("tr.incomplete-section-row .expand-btn").forEach((b) => {
        if (b !== btn) {
          b.setAttribute("aria-expanded", "false");
          b.textContent = "+";
        }
      });

      const detailRow = document.getElementById(detailId);
      const isOpen = detailRow && !detailRow.classList.contains("is-hidden");
      if (detailRow) detailRow.classList.toggle("is-hidden", isOpen);

      btn.setAttribute("aria-expanded", isOpen ? "false" : "true");
      btn.textContent = isOpen ? "+" : "\u2212";
    });
  }
}

async function loadConflicts() {
  const container = document.getElementById("conflictsGrid");
  if (!container) return;

  container.classList.add("muted");
  container.textContent = "Loading...";

  const data = (await authFetchJson("/dashboard/conflicts?limit=500")) || [];
  if (!data.length) {
    container.textContent = "No conflicts detected.";
    return;
  }

  container.classList.remove("muted");
  container.innerHTML = data.map((c) => {
      const priority = escapeHtml(c.priority || "");
      const msg = escapeHtml(c.message || "");
      const ts = escapeHtml(c.timestamp || "");
      return `
        <div class="conflict">
          <strong>${priority || "Conflict"}</strong><br />
          ${msg}<br />
          <span class="muted">${ts}</span>
        </div>
      `;
    }).join("");
}

async function init() {
  if (!token) {
    // Keep it simple: redirect to login if dashboard is opened without auth.
    window.location.href = "/ZClassScheduler/html/Login.html";
    return;
  }

  try {
    // Room utilization controls
    const btnDay = document.getElementById("utilModeDay");
    const btnWeek = document.getElementById("utilModeWeek");
    const daySel = document.getElementById("utilDaySelect");

    if (daySel) {
      // Populate and set default selection
      if (!daySel.value) daySel.value = todayKey();
      if (!UTIL_DAYS.includes(daySel.value)) daySel.value = "MONDAY";
    }

    // Default mode: per-day
    setUtilMode("day");

    if (btnDay && !btnDay.dataset.bound) {
      btnDay.dataset.bound = "1";
      btnDay.addEventListener("click", () => {
        setUtilMode("day");
        loadRoomUtilization();
      });
    }
    if (btnWeek && !btnWeek.dataset.bound) {
      btnWeek.dataset.bound = "1";
      btnWeek.addEventListener("click", () => {
        setUtilMode("week");
        loadRoomUtilization();
      });
    }
    if (daySel && !daySel.dataset.bound) {
      daySel.dataset.bound = "1";
      daySel.addEventListener("change", () => {
        if (utilMode === "day") loadRoomUtilization();
      });
    }

    await loadSummary();
    await Promise.all([
      loadRoomOverview(),
      loadRoomUtilization(),
      loadIncompleteSchedules(),
      loadConflicts(),
    ]);
  } catch (e) {
    console.error(e);
  }
}

document.addEventListener("DOMContentLoaded", init);
