const API_BASE = "/api/settings/school-hours";

const days = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];
const defaultTimes = { start: "07:00", end: "21:00" };

const form = document.getElementById("schoolHoursForm");
const dayRulesBody = document.getElementById("dayRulesBody");
const yearInput = document.getElementById("currentSchoolYear");
const termInput = document.getElementById("currentTerm");
const formHint = document.getElementById("formHint");

function authHeaders() {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function showHint(message, ok = true) {
    if (!formHint) return;
    formHint.textContent = message || "";
    formHint.style.color = ok ? "#0f766e" : "#b91c1c";
}

function renderDayRules(items = []) {
    const map = new Map(items.map((x) => [String(x.dayOfWeek || "").toUpperCase(), x]));
    dayRulesBody.innerHTML = days.map((day) => {
        const rule = map.get(day);
        const isOpen = rule ? !!rule.isOpen : true;
        const start = rule?.timeStart ? String(rule.timeStart).slice(0, 5) : defaultTimes.start;
        const end = rule?.timeEnd ? String(rule.timeEnd).slice(0, 5) : defaultTimes.end;
        return `
            <tr>
              <td>${day}</td>
              <td><input type="checkbox" data-day="${day}" data-field="isOpen" ${isOpen ? "checked" : ""}></td>
              <td><input type="time" data-day="${day}" data-field="timeStart" value="${start}"></td>
              <td><input type="time" data-day="${day}" data-field="timeEnd" value="${end}"></td>
            </tr>
        `;
    }).join("");
}

function collectDayRules() {
    return days.map((day) => {
        const isOpen = dayRulesBody.querySelector(`input[data-day="${day}"][data-field="isOpen"]`)?.checked ?? true;
        const timeStart = dayRulesBody.querySelector(`input[data-day="${day}"][data-field="timeStart"]`)?.value || defaultTimes.start;
        const timeEnd = dayRulesBody.querySelector(`input[data-day="${day}"][data-field="timeEnd"]`)?.value || defaultTimes.end;
        return { dayOfWeek: day, isOpen, timeStart, timeEnd };
    });
}

async function fetchActiveConfig() {
    const res = await fetch(`${API_BASE}/active`, { headers: { ...authHeaders(), Accept: "application/json" } });
    if (!res.ok) {
        renderDayRules();
        showHint("No active school-hours settings yet. Configure and save to enable schedule-block creation.", false);
        return;
    }

    const payload = await res.json();
    const data = payload?.data || {};

    yearInput.value = data.currentSchoolYear || "";
    termInput.value = data.currentTerm || "";
    const resolvedDayRules = Array.isArray(data.dayRules) ? data.dayRules : (Array.isArray(data.rules) ? data.rules : []);
    renderDayRules(resolvedDayRules);
    showHint("Active school-hours configuration loaded.", true);
}

form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
        currentSchoolYear: String(yearInput.value || "").trim(),
        currentTerm: String(termInput.value || "").trim(),
        dayRules: collectDayRules(),
    };

    if (!payload.currentSchoolYear || !payload.currentTerm) {
        showHint("Current school year and term are required.", false);
        return;
    }

    try {
        const res = await fetch(API_BASE, {
            method: "POST",
            headers: {
                ...authHeaders(),
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify(payload),
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.success === false) {
            showHint(body?.message || "Failed to save school-hours settings.", false);
            return;
        }

        showHint("School-hours settings saved. Schedule block creation is now enabled for the active term.", true);
        await fetchActiveConfig();
    } catch {
        showHint("Network error while saving school-hours settings.", false);
    }
});

renderDayRules();
fetchActiveConfig();
