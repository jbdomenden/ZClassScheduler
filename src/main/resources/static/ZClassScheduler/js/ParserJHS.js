// JhsParser.js
/* =========================================================
   Junior High School curriculum PDF parser (Template-based)
   - Blocks by grade (NO term):
       Grade 7 => yearTerm "1"
       Grade 8 => yearTerm "2"
       Grade 9 => yearTerm "3"
       Grade 10 => yearTerm "4"

   Matches the actual JHS template where:
   - Grade headers look like: "Junior High School Grade 7"
   - Subject rows begin with a 6-digit Course ID and "JRHS"
   - Descriptions can wrap across lines BEFORE units appear (e.g., TLE line wraps)

   Output:
     { program, subjects: [{ code, name, yearTerm }] }
========================================================= */

(function (w) {
    function normalizeLines(text) {
        return String(text || "")
            .split(/\r?\n/)
            .map((l) => l.replace(/\s+/g, " ").trim())
            .filter(Boolean);
    }

    function mapGradeToYearTerm(grade) {
        const g = parseInt(grade, 10);
        if (!Number.isFinite(g)) return null;
        if (g >= 7 && g <= 10) return String(g - 6); // 7->1, 8->2, 9->3, 10->4
        return null;
    }

    function detectGradeHeader(line) {
        // Exact template: "Junior High School Grade 7"
        let m = String(line || "").match(/^Junior High School Grade\s+(7|8|9|10)$/i);
        if (m) return mapGradeToYearTerm(m[1]);

        // Extra tolerance (if PDF text extraction changes slightly)
        m = String(line || "").match(/\bJunior\s+High\s+School\s+Grade\s+(7|8|9|10)\b/i);
        if (m) return mapGradeToYearTerm(m[1]);

        return null;
    }

    function isRowStart(line) {
        // 6-digit Course ID at start
        return /^\d{6}\b/.test(line);
    }

    function hasUnitsToken(line) {
        // Units column appears as 1.00 (always in the template)
        return /\b\d+\.\d{2}\b/.test(line);
    }

    function mergeWrappedRows(lines) {
        // Build complete logical rows:
        // - Start when line begins with 6-digit course id
        // - Keep appending following lines until units token appears (1.00)
        const merged = [];
        let buf = "";

        function flush() {
            if (buf) merged.push(buf.trim());
            buf = "";
        }

        for (const line of lines) {
            if (isRowStart(line)) {
                // New row start
                flush();
                buf = line;
                // If it already contains units token, flush immediately
                if (hasUnitsToken(buf)) flush();
            } else if (buf) {
                // Continuation of current row
                buf += " " + line;
                if (hasUnitsToken(buf)) flush();
            } else {
                // Not in a row; keep as standalone (headers, etc.)
                merged.push(line);
            }
        }
        flush();

        return merged;
    }

    function parseRow(line) {
        // Expected shape (after merge):
        // 002619 JRHS 1001 15 English 7 1.00 Lecture
        // courseId subjectArea catalogNo offeringNo description... units component ...
        const m = String(line || "").match(
            /^(\d{6})\s+(JRHS)\s+(\d{4})\s+(\d{1,3})\s+(.*)$/i
        );
        if (!m) return null;

        const subjectArea = m[2].toUpperCase();
        const catalogNo = m[3];
        let remainder = m[5] || "";

        // Cut description before units (1.00 ...)
        const unitPos = remainder.search(/\b\d+\.\d{2}\b/);
        if (unitPos >= 0) remainder = remainder.slice(0, unitPos).trim();

        const name = remainder.replace(/\s+/g, " ").trim();
        if (!name) return null;

        // Code pattern used elsewhere in your app: SUBJECTAREA + CATALOGNO
        const code = `${subjectArea}${catalogNo}`.replace(/\s+/g, "").trim();

        return { code, name };
    }

    function parse(text) {
        const lines = mergeWrappedRows(normalizeLines(text));

        // Program: keep consistent with existing behavior
        // (Curriculum code is handled elsewhere; JHS pages are labeled "JHS-24-01")
        let program = "JHS";

        // Best-effort: If we see "JHS-24-01" in text, still keep program "JHS"
        // (Program here is mostly for UI; dept drives parsing anyway.)
        let currentYearTerm = null;
        const subjects = [];

        for (const line of lines) {
            const yt = detectGradeHeader(line);
            if (yt) {
                currentYearTerm = yt;
                continue;
            }

            const row = parseRow(line);
            if (!row) continue;

            // Safety: if grade header missing for some reason, default to Grade 7 mapping (yearTerm=1)
            const yearTerm = currentYearTerm || "1";

            subjects.push({
                code: row.code,
                name: row.name,
                yearTerm
            });
        }

        return { program, subjects };
    }

    w.JhsParser = { parse };
})(window);