const API_BASE = "/api/logs/schedule";
const PAGE_SIZE = 200;
let nextOffset = 0;
let loading = false;

function token(){ return (localStorage.getItem("token")||"").trim(); }
function authHeaders(){ const t = token(); return t ? { Authorization:`Bearer ${t}` } : {}; }
function esc(s){ return String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

function setRow(txt){
  const tb = document.getElementById("scheduleLogsTbody");
  if (tb) tb.innerHTML = `<tr><td colspan="7" class="muted">${esc(txt)}</td></tr>`;
}

async function fetchLogs(reset=false){
  if (loading) return;
  loading = true;
  const tb = document.getElementById("scheduleLogsTbody");
  const more = document.getElementById("loadMoreBtn");
  try{
    if (!token()) { window.location.href = "/ZClassScheduler/html/Login.html"; return; }
    if (reset){ nextOffset = 0; setRow("Loading..."); if (more) more.style.display = "none"; }

    const q = (document.getElementById("q")?.value || "").trim();
    const url = new URL(API_BASE, window.location.origin);
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", String(nextOffset));
    if (q) url.searchParams.set("search", q);

    const res = await fetch(url.toString(), { headers:{ Accept:"application/json", ...authHeaders() } });
    if (res.status === 401) { window.location.href = "/ZClassScheduler/html/Login.html"; return; }
    if (res.status === 403) { appAlert("Forbidden."); return; }
    if (!res.ok) throw new Error(`${res.status}`);

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    if (reset && tb) tb.innerHTML = "";
    if (reset && !items.length) { setRow("No schedule logs found."); return; }

    const html = items.map(it => `<tr>
      <td>${esc(new Date(it.timestamp).toLocaleString())}</td>
      <td>${esc(it.actorRole)}</td>
      <td>${esc(it.actorEmail || it.actorUserKey || "")}</td>
      <td>${esc(it.action)}</td>
      <td>${esc(it.entityType)}</td>
      <td>${esc(it.sectionCode || it.scheduleBlock || "")}</td>
      <td>${esc(it.notes || it.newValue || it.previousValue || "")}</td>
    </tr>`).join("");
    tb?.insertAdjacentHTML("beforeend", html);

    nextOffset = typeof data?.nextOffset === "number" ? data.nextOffset : null;
    if (more) more.style.display = nextOffset !== null ? "" : "none";
  }catch(e){ console.error(e); if (reset) setRow("Failed to load logs."); }
  finally { loading = false; }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("refreshBtn")?.addEventListener("click", () => fetchLogs(true));
  document.getElementById("loadMoreBtn")?.addEventListener("click", () => fetchLogs(false));
  let t = null;
  document.getElementById("q")?.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => fetchLogs(true), 250); });
  fetchLogs(true);
});
