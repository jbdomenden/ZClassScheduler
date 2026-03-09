const API_BASE = "/api/settings/checker-logs";
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
    status: (document.getElementById("statusFilter")?.value || "").trim(),
  };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtTime(ts) {
  try { return new Date(ts).toLocaleString(); } catch { return String(ts); }
}

function setLoadingRow(txt) {
  const tbody = document.getElementById("checkerTbody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="10" class="muted">${escapeHtml(txt)}</td></tr>`;
}

let nextOffset = 0;
let loading = false;

async function fetchLogs(reset = false) {
  if (loading) return;
  loading = true;

  const tbody = document.getElementById("checkerTbody");
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
    if (f.status) url.searchParams.set("status", f.status);

    const res = await fetch(url.toString(), { headers: { Accept: "application/json", ...authHeaders() } });
    if (res.status === 401) {
      window.location.href = "/ZClassScheduler/html/Login.html";
      return;
    }
    if (res.status === 403) {
      appAlert("Forbidden.");
      window.location.href = "/ZClassScheduler/html/SchedulesOverview.html";
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
      const status = String(it.status || (it.present ? "PRESENT" : "ABSENT") || "").trim().toUpperCase();
      const badge = (status === "PRESENT")
        ? `<span style="color:#16a34a;font-weight:900;">PRESENT</span>`
        : (status === "NOT_IN_CLASS")
          ? `<span style="color:#64748b;font-weight:900;">NOT IN CLASS</span>`
          : `<span style="color:#dc2626;font-weight:900;">ABSENT</span>`;

      return `
<tr>
  <td style="white-space:nowrap;">${escapeHtml(fmtTime(it.timestamp))}</td>
  <td>${escapeHtml(it.checkerName || it.checkerEmail || it.checkerUserKey || "")}</td>
  <td>${escapeHtml(it.teacherName || "")}</td>
  <td>${escapeHtml(it.teacherDepartment || "")}</td>
  <td>${escapeHtml(it.roomCode || "")}</td>
  <td style="white-space:nowrap;">${escapeHtml(it.dayOfWeek || "")}</td>
  <td style="white-space:nowrap;">${escapeHtml(it.timeStart || "")}</td>
  <td style="white-space:nowrap;">${escapeHtml(it.timeEnd || "")}</td>
  <td>${badge}</td>
  <td>${escapeHtml(it.note || "")}</td>
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
  document.getElementById("refreshBtn")?.addEventListener("click", () => fetchLogs(true));
  document.getElementById("loadMoreBtn")?.addEventListener("click", () => fetchLogs(false));
  document.getElementById("printBtn")?.addEventListener("click", () => window.print());

  let t = null;
  const onChange = () => {
    clearTimeout(t);
    t = setTimeout(() => fetchLogs(true), 200);
  };
  document.getElementById("q")?.addEventListener("input", onChange);
  document.getElementById("statusFilter")?.addEventListener("change", () => fetchLogs(true));
}

document.addEventListener("DOMContentLoaded", () => {
  bind();
  fetchLogs(true);
});
