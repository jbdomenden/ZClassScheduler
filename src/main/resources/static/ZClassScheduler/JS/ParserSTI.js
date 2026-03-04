// StiParser.js
/* =========================================================
   StiParser.js
   - STI Tertiary curriculum PDF parser
   - Produces: { program, subjects: [{ code, name, yearTerm }] }

   Notes
   - yearTerm must be numeric for backend.
     * Year 1 Term 1 -> 1 ... Year 4 Term 2 -> 8
   - Electives are saved as yearTerm=9 (numeric) to avoid backend 500.
     * Elective sub-block is stored in subject name suffix: " [[EL:SubBlock]]"
   - This parser is designed for PDFs where columns are extracted as separate lines.
========================================================= */

(function (w) {
    const ELECTIVE_YT = 9;

    function normalizeLines(text) {
        return String(text || "")
            .split(/\r?\n/)
            .map(l => l.replace(/\s+/g, " ").trim())
            .filter(Boolean);
    }

    function yearWordToNum(wd) {
        const x = String(wd || "").toLowerCase();
        if (x === "first") return 1;
        if (x === "second") return 2;
        if (x === "third") return 3;
        if (x === "fourth") return 4;
        return null;
    }

    function termWordToNum(wd) {
        const x = String(wd || "").toLowerCase();
        if (x === "first") return 1;
        if (x === "second") return 2;
        return null;
    }

    function yearTermNum(year, term) {
        return String((year - 1) * 2 + term);
    }

    function detectProgram(lines) {
        for (const l of lines.slice(0, 100)) {
            let m = l.match(/^([A-Z]{2,10})\s+(FIRST|SECOND|THIRD|FOURTH)\s+YEAR,\s+(FIRST|SECOND)\s+TERM\b/i);
            if (m) return m[1].toUpperCase();
            m = l.match(/^([A-Z]{2,10})\s*-\s*BS\b/i);
            if (m) return m[1].toUpperCase();
        }
        return "";
    }

    function parseColumnFlow(lines) {
        let program = detectProgram(lines);

        let currentYearTerm = ""; // 1..8
        let inElectives = false;
        let electiveSubBlock = "";

        const isCourseId = (s) => /^\d{6}$/.test(s);
        const isUnits = (s) => /^\d+\.\d{2}$/.test(s);

        const subjects = [];

        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];

            // Year/Term header
            const header = l.match(/^([A-Z]{2,10})\s+(FIRST|SECOND|THIRD|FOURTH)\s+YEAR,\s+(FIRST|SECOND)\s+TERM\b/i);
            if (header) {
                if (!program) program = header[1].toUpperCase();
                const y = yearWordToNum(header[2]);
                const t = termWordToNum(header[3]);
                currentYearTerm = (y && t) ? yearTermNum(y, t) : "";
                inElectives = false;
                electiveSubBlock = "";
                continue;
            }

            // Enter electives (parent)
            if (/^\s*[A-Z]{2,10}\s+ELECTIVE\s+COURSES\b/i.test(l)) {
                inElectives = true;
                electiveSubBlock = "";
                continue;
            }

            // Elective sub-block line: "Elective Course List (Application Development)"
            let em = l.match(/ELECTIVE\s+COURSE\s+LIST\s*\(([^)]+)\)/i);
            if (em) {
                inElectives = true;
                electiveSubBlock = String(em[1] || "").replace(/\s+/g, " ").trim();
                continue;
            }
            // Alternate: "Electives (Graphics Technology)"
            em = l.match(/ELECTIVES\s*\(([^)]+)\)/i);
            if (em) {
                inElectives = true;
                electiveSubBlock = String(em[1] || "").replace(/\s+/g, " ").trim();
                continue;
            }

            // Row start
            if (!isCourseId(l)) continue;

            // Expect: Subject Area, Catalog No, Offering No
            const subjectArea = (lines[i + 1] || "").toUpperCase();
            const catalogNo = (lines[i + 2] || "");
            const offeringNo = (lines[i + 3] || "");

            if (!/^[A-Z]{2,10}$/.test(subjectArea)) continue;
            if (!/^\d{4}$/.test(catalogNo)) continue;
            if (!/^\d{1,3}$/.test(offeringNo)) continue;

            i += 4; // move to description

            const descParts = [];
            while (i < lines.length && !isUnits(lines[i]) && !isCourseId(lines[i])) {
                if (/YEAR,\s+(FIRST|SECOND)\s+TERM\b/i.test(lines[i])) break;

                if (/^(COURSE ID|SUBJECT AREA|CATALOG NO|OFFERING NO|DESCRIPTION|UNIT\/S|COMPONENT|PRE REQUISITE)/i.test(lines[i])) {
                    i++;
                    continue;
                }

                if (/^\d+\.\d{2}$/.test(lines[i])) break;

                descParts.push(lines[i]);
                i++;
            }

            if (i < lines.length && isUnits(lines[i])) i++;

            i--;

            const desc = descParts.join(" ").replace(/\s+/g, " ").trim();
            if (!desc) continue;

            const code = `${subjectArea}${catalogNo}`.replace(/\s+/g, "").trim();

            let yearTerm = currentYearTerm || "1";
            let name = desc;

            if (inElectives) {
                yearTerm = String(ELECTIVE_YT);
                const sub = electiveSubBlock || "Electives";
                name = `${desc} [[EL:${sub}]]`;
            }

            subjects.push({ code, name, yearTerm });

            if (!program) program = subjectArea;
        }

        return { program, subjects };
    }

    function parseMergedRowFallback(text) {
        const rawLines = String(text || "")
            .split(/\r?\n/)
            .map(l => l.trim())
            .filter(Boolean);

        let program = "";
        for (const l of rawLines.slice(0, 120)) {
            const m = l.match(/^([A-Z]{2,10})\s+(FIRST|SECOND|THIRD|FOURTH)\s+YEAR,\s+(FIRST|SECOND)\s+TERM\b/i);
            if (m) { program = m[1].toUpperCase(); break; }
        }

        const merged = [];
        const rowStartRe = /^\d{6}\s+[A-Z]{2,10}\s+\d{4}\s+\d{1,3}\s+/;
        const hasUnitsRe = /\b\d+\.\d{2}\b/;

        for (let i = 0; i < rawLines.length; i++) {
            const l = rawLines[i];
            if (rowStartRe.test(l)) {
                merged.push(l);
                continue;
            }
            if (merged.length && rowStartRe.test(merged[merged.length - 1]) && !hasUnitsRe.test(merged[merged.length - 1])) {
                merged[merged.length - 1] += " " + l;
                continue;
            }
            merged.push(l);
        }

        let currentYear = null;
        let currentTerm = null;
        let inElectives = false;
        let electiveSubBlock = "";

        const subjects = [];

        for (const l of merged) {
            let hm = l.match(/^([A-Z]{2,10})\s+(FIRST|SECOND|THIRD|FOURTH)\s+YEAR,\s+(FIRST|SECOND)\s+TERM\b/i);
            if (hm) {
                if (!program) program = hm[1].toUpperCase();
                currentYear = yearWordToNum(hm[2]);
                currentTerm = termWordToNum(hm[3]);
                inElectives = false;
                electiveSubBlock = "";
                continue;
            }

            if (/^\s*[A-Z]{2,10}\s+ELECTIVE\s+COURSES\b/i.test(l)) {
                inElectives = true;
                electiveSubBlock = "";
                continue;
            }

            let em = l.match(/ELECTIVE\s+COURSE\s+LIST\s*\(([^)]+)\)/i);
            if (em) {
                inElectives = true;
                electiveSubBlock = String(em[1] || "").trim();
                continue;
            }
            em = l.match(/ELECTIVES\s*\(([^)]+)\)/i);
            if (em) {
                inElectives = true;
                electiveSubBlock = String(em[1] || "").trim();
                continue;
            }

            const rm = l.match(/^(\d{6})\s+([A-Z]{2,10})\s+(\d{4})\s+(\d{1,3})\s+(.*)$/);
            if (!rm) continue;

            const subjectArea = rm[2].toUpperCase();
            const catalogNo = rm[3];
            const remainder = rm[5];

            const unitsPos = remainder.search(/\b\d+\.\d{2}\b/);
            let desc = unitsPos >= 0 ? remainder.slice(0, unitsPos).trim() : remainder.trim();
            desc = desc.replace(/\s+/g, " ").trim();
            if (!desc) continue;

            const code = `${subjectArea}${catalogNo}`.replace(/\s+/g, "").trim();

            let yearTerm = "1";
            let name = desc;

            if (inElectives) {
                yearTerm = String(ELECTIVE_YT);
                const sub = electiveSubBlock || "Electives";
                name = `${desc} [[EL:${sub}]]`;
            } else if (currentYear && currentTerm) {
                yearTerm = yearTermNum(currentYear, currentTerm);
            }

            subjects.push({ code, name, yearTerm });
            if (!program) program = subjectArea;
        }

        return { program, subjects };
    }

    function parse(text) {
        const lines = normalizeLines(text);
        const primary = parseColumnFlow(lines);
        if (primary?.subjects?.length) return primary;
        return parseMergedRowFallback(text);
    }

    w.StiParser = { parse };
})(window);