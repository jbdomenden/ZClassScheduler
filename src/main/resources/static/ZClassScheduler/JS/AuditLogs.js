const API_BASE = "/api/settings/audit-logs";
const PAGE_SIZE = 200;

function token() {
  return (localStorage.getItem("token") || "").trim();
}

function authHeaders() {
  const t = token();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function qs() {
  return {
    q: (document.getElementById("q")?.value || "").trim(),
    role: (document.getElementById("roleFilter")?.value || "").trim(),
    success: (document.getElementById("successFilter")?.value || "").trim(),
  };
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function titleCaseFromCode(code) {
  return String(code || "")
    .trim()
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function friendlyAction(action) {
  const a = String(action || "").trim().toUpperCase();
  const map = {
    ROOM_CREATE: "Created a room",
    ROOM_UPDATE: "Updated a room",
    ROOM_DEACTIVATE: "Deactivated a room",
    ROOM_BLOCK_CREATE: "Blocked room time",

    TEACHER_CREATE: "Created a teacher",
    TEACHER_UPDATE: "Updated a teacher",
    TEACHER_DEACTIVATE: "Deactivated a teacher",
    TEACHER_BLOCK_CREATE: "Added teacher time block",
    TEACHER_BLOCK_DELETE: "Removed teacher time block",

    COURSE_CREATE: "Created a course",
    COURSE_UPDATE: "Updated a course",
    COURSE_SET_ACTIVE: "Changed course status",
    COURSE_DEACTIVATE: "Deactivated a course",

    CURRICULUM_CREATE: "Created a curriculum",
    CURRICULUM_UPLOAD: "Uploaded a curriculum",
    CURRICULUM_SET_ACTIVE: "Changed curriculum status",
    CURRICULUM_DEACTIVATE: "Deactivated a curriculum",
    CURRICULUM_HARD_DELETE: "Deleted a curriculum",
  };
  return map[a] || titleCaseFromCode(a);
}

function friendlyEntity(entity) {
  const e = String(entity || "").trim();
  const map = {
    Room: "Rooms",
    Teacher: "Teachers",
    Course: "Courses",
    Curriculum: "Curriculums",
    RoomBlock: "Room blocks",
    TeacherBlock: "Teacher blocks",
  };
  return map[e] || e || "Unknown";
}

function setLoadingRow(txt) {
  const tbody = document.getElementById("auditTbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="muted">${txt}</td></tr>`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function sentence(s, fallback = "") {
  const t = String(s ?? "").trim();
  const v = t || fallback;
  if (!v) return "";
  return /[.!?]$/.test(v) ? v : `${v}.`;
}

let nextOffset = 0;
let loading = false;

async function fetchLogs(reset = false) {
  if (loading) return;
  loading = true;

  const tbody = document.getElementById("auditTbody");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  try {
    const t = token();
    if (!t) {
      window.location.href = "/ZClassScheduler/html/Login.html";
      return;
    }

    if (reset) {
      nextOffset = 0;
      setLoadingRow("Loading...");
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
    }

    const f = qs();
    const url = new URL(API_BASE, window.location.origin);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(nextOffset));
    if (f.q) url.searchParams.set("q", f.q);
    if (f.role) url.searchParams.set("role", f.role);
    if (f.success) url.searchParams.set("success", f.success);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", ...authHeaders() },
    });

    if (res.status === 401) {
      window.location.href = "/ZClassScheduler/html/Login.html";
      return;
    }
    if (res.status === 403) {
      appAlert("Forbidden: SUPER_ADMIN only.");
      window.location.href = "/ZClassScheduler/html/Dashboard.html";
      return;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    if (reset) tbody.innerHTML = "";

    if (items.length === 0 && reset) {
      setLoadingRow("No logs found.");
      return;
    }

    const rowsHtml = items.map((it) => {
      const ok = !!it.success;
      const badge = ok
        ? `<span style="color:#16a34a;font-weight:800;">OK</span>`
        : `<span style="color:#dc2626;font-weight:800;">FAIL</span>`;

      const details = sentence(it.message, friendlyAction(it.action));

      return `
<tr>
  <td style="white-space:nowrap;">${escapeHtml(fmtTime(it.timestamp))}</td>
  <td>${escapeHtml(it.role)}</td>
  <td>${escapeHtml(it.userName || it.userEmail || it.userKey || "")}</td>
  <td>${escapeHtml(friendlyAction(it.action))}</td>
  <td>${escapeHtml(friendlyEntity(it.entity))}</td>
  <td>${badge}</td>
  <td>${escapeHtml(details)}</td>
</tr>`;
    }).join("");

    tbody.insertAdjacentHTML("beforeend", rowsHtml);

    nextOffset = (typeof data?.nextOffset === "number") ? data.nextOffset : null;
    if (loadMoreBtn) loadMoreBtn.style.display = (nextOffset !== null) ? "" : "none";
  } catch (e) {
    console.error(e);
    if (reset) setLoadingRow("Failed to load logs.");
  } finally {
    loading = false;
  }
}

function bind() {
  const refreshBtn = document.getElementById("refreshBtn");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const printBtn = document.getElementById("printBtn");
  const qInput = document.getElementById("q");
  const roleFilter = document.getElementById("roleFilter");
  const successFilter = document.getElementById("successFilter");

  refreshBtn?.addEventListener("click", () => fetchLogs(true));
  loadMoreBtn?.addEventListener("click", () => fetchLogs(false));
  printBtn?.addEventListener("click", () => window.print());

  // Debounced search
  let t = null;
  const onChange = () => {
    clearTimeout(t);
    t = setTimeout(() => fetchLogs(true), 200);
  };
  qInput?.addEventListener("input", onChange);
  roleFilter?.addEventListener("change", () => fetchLogs(true));
  successFilter?.addEventListener("change", () => fetchLogs(true));
}

document.addEventListener("DOMContentLoaded", () => {
  bind();
  fetchLogs(true);
});
