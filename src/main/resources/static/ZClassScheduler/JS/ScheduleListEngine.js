/* =============================================================================================
   SCHEDULE LIST ENGINE
   Purpose:
   - Render grouped schedule list table (Overview style)
   - Preserve rowspan per section
   - Preserve spacer row
   - Follow current table column structure

   Requires:
   - scheduleDB.js format
============================================================================================= */

export function renderScheduleList(tableId, data) {

    const table = document.getElementById(tableId);
    if (!table) return;

    const tbody = table.querySelector("tbody");
    tbody.innerHTML = "";

    if (!data || data.length === 0) return;

    const grouped = groupBySection(data);

    Object.keys(grouped).sort().forEach(section => {

        const entries = grouped[section];
        const rowCount = entries.length;

        entries.forEach((entry, index) => {

            const tr = document.createElement("tr");
            if (entry.conflict) tr.classList.add("conflict-row");
            if (entry.conflictRemarks && entry.conflictRemarks.length) {
                tr.title = entry.conflictRemarks.join("\n");
            }

            /* ==========================================================
               SECTION CELL (ROWSPAN)
            ========================================================== */

            if (index === 0) {

                const sectionTd = document.createElement("td");
                sectionTd.className = "section-cell";
                sectionTd.rowSpan = rowCount;

                sectionTd.innerHTML = `
                    <strong>${entry.section}</strong><br>
                    <small>${entry.source ? `${entry.source} | ` : ""}Curriculum ${entry.curriculum}</small>
                `;

                tr.appendChild(sectionTd);
            }

            /* COURSE CODE */
            tr.appendChild(createCell(entry.code));

            /* DESCRIPTION */
            const descTd = document.createElement("td");
            descTd.innerHTML = `
                ${entry.subject}<br>
                <small>${entry.type}</small>
            `;
            tr.appendChild(descTd);

            /* DAY */
            tr.appendChild(createCell(entry.day));

            /* START */
            tr.appendChild(createCell(entry.start));

            /* END */
            tr.appendChild(createCell(entry.end));

            /* ROOM */
            tr.appendChild(createCell(entry.room));

            /* INSTRUCTOR */
            tr.appendChild(createCell(getTeacherFullName(entry)));

            tbody.appendChild(tr);
        });

        /* ==========================================================
           SECTION SPACER ROW
        ========================================================== */

        const spacer = document.createElement("tr");
        spacer.className = "section-break";
        spacer.innerHTML = `<td colspan="8"></td>`;
        tbody.appendChild(spacer);
    });
}

/* =============================================================================================
   HELPERS
============================================================================================= */

function createCell(value) {
    const td = document.createElement("td");
    td.textContent = value;
    return td;
}

function groupBySection(data) {
    const map = {};

    data.forEach(entry => {
        const key = entry.sectionKey || entry.section;
        if (!map[key]) {
            map[key] = [];
        }
        map[key].push(entry);
    });

    return map;
}

function getTeacherFullName(entry) {
    return `${entry.teacherDept} ${entry.teacherFN} ${entry.teacherLN}`;
}
